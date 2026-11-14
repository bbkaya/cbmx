-- Pending local migration. Never replay historical migrations or clean up old links here.
begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Run this migration as the trusted postgres role';
  end if;
  if to_regprocedure('public.save_blueprint_with_version(uuid,bigint,text,jsonb)') is null
     or to_regprocedure('public.unlink_cbmx_process_link(uuid,text)') is null then
    raise exception 'Existing CBMX save and unlink RPCs are required';
  end if;
end;
$$;

-- Existing save RPCs, direct table updates, and imports cannot silently remove
-- linked processes or revive a historical orphan by reintroducing its ID.
-- SECURITY DEFINER is needed to see links hidden by PCB SELECT policies.
create function private.guard_cbmx_process_link_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.cbmx_process_links l
    where l.cbmx_blueprint_id = old.id
      and exists (select 1 from jsonb_array_elements(coalesce(old.blueprint_json -> 'coCreationProcesses', '[]'::jsonb)) p where p ->> 'id' = l.cbmx_process_id)
      and not exists (select 1 from jsonb_array_elements(coalesce(new.blueprint_json -> 'coCreationProcesses', '[]'::jsonb)) p where p ->> 'id' = l.cbmx_process_id)
  ) then
    raise exception 'Delete linked co-creation processes explicitly before removing them from a blueprint or importing JSON.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.cbmx_process_links l
    where l.cbmx_blueprint_id = old.id
      and not exists (select 1 from jsonb_array_elements(coalesce(old.blueprint_json -> 'coCreationProcesses', '[]'::jsonb)) p where p ->> 'id' = l.cbmx_process_id)
      and exists (select 1 from jsonb_array_elements(coalesce(new.blueprint_json -> 'coCreationProcesses', '[]'::jsonb)) p where p ->> 'id' = l.cbmx_process_id)
  ) then
    raise exception 'This process ID has a historical association. Assign a new process ID before saving.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_cbmx_process_link_removal
before update of blueprint_json on public.blueprints
for each row execute function private.guard_cbmx_process_link_removal();

-- Serialize link writes with blueprint saves/deletions, including callers of the
-- legacy upsert RPC. Its earlier existence check alone has a check/write race.
create function private.guard_cbmx_process_link_target()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_json jsonb;
begin
  select b.blueprint_json into v_json from public.blueprints b
  where b.id = new.cbmx_blueprint_id for update;
  if not found or not exists (
    select 1 from jsonb_array_elements(coalesce(v_json -> 'coCreationProcesses', '[]'::jsonb)) p
    where p ->> 'id' = new.cbmx_process_id
  ) then
    raise exception 'The specified co-creation process no longer belongs to the CBMX blueprint' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_cbmx_process_link_target
before insert or update on public.cbmx_process_links
for each row execute function private.guard_cbmx_process_link_target();

-- The supplied JSON is the draft BEFORE deletion. Only the server removes the
-- target ID, so autosave never receives a tentative deletion. All other linked
-- removals are still rejected by the table guard.
create function public.delete_cbmx_process_with_version(
  p_blueprint_id uuid,
  p_loaded_version_no bigint,
  p_name text,
  p_blueprint_json jsonb,
  p_process_id text,
  p_expected_pcb_id uuid
)
returns table (
  ok boolean, reason text, id uuid, name text, owner_user_id uuid,
  blueprint_json jsonb, created_at timestamptz, updated_at timestamptz,
  version_no bigint, updated_by_user_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.blueprints%rowtype;
  v_reason text;
  v_pcb_id uuid;
  v_json jsonb;
  v_saved record;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Match save_blueprint_with_version's membership rule exactly.
  if not exists (select 1 from public.blueprint_members bm
    where bm.blueprint_id = p_blueprint_id and bm.user_id = v_uid and bm.role in ('owner', 'editor')) then
    v_reason := 'forbidden';
  else
    select b.* into v_row from public.blueprints b where b.id = p_blueprint_id for update;
    if not found then v_reason := 'not_found';
    elsif v_row.version_no is distinct from p_loaded_version_no then v_reason := 'stale';
    end if;
  end if;
  if v_reason is not null then
    return query select false, v_reason, null::uuid, null::text, null::uuid,
      null::jsonb, null::timestamptz, null::timestamptz, null::bigint, null::uuid;
    return;
  end if;
  if p_process_id is null or btrim(p_process_id) = '' or
    (select count(*) from jsonb_array_elements(coalesce(p_blueprint_json -> 'coCreationProcesses', '[]'::jsonb)) p
      where p ->> 'id' = p_process_id) <> 1 then
    raise exception 'The draft must contain exactly one process with the specified ID' using errcode = '22023';
  end if;
  select l.process_canvas_blueprint_id into v_pcb_id from public.cbmx_process_links l
  where l.cbmx_blueprint_id = p_blueprint_id and l.cbmx_process_id = p_process_id for update;
  -- null means the caller checked and found no association. If a link changed
  -- since confirmation, abort and require a fresh check/confirmation.
  if v_pcb_id is distinct from p_expected_pcb_id then
    raise exception 'The Process Canvas association changed. Nothing was deleted. Try deleting again to review the current association.' using errcode = '40001';
  end if;
  if v_pcb_id is not null then
    -- The process still exists in persisted JSON here. Reuse all existing unlink
    -- authorization checks, including edit access to the PCB; never delete a PCB.
    perform public.unlink_cbmx_process_link(p_blueprint_id, p_process_id);
  end if;
  select jsonb_set(p_blueprint_json, '{coCreationProcesses}', coalesce(jsonb_agg(p.value order by p.ordinality), '[]'::jsonb))
  into v_json from jsonb_array_elements(p_blueprint_json -> 'coCreationProcesses') with ordinality p(value, ordinality)
  where p.value ->> 'id' is distinct from p_process_id;

  select * into v_saved from public.save_blueprint_with_version(p_blueprint_id, p_loaded_version_no, p_name, v_json);
  if v_saved.ok is distinct from true then
    -- A normal failure result MUST become an exception after unlinking, so the
    -- entire transaction rolls back, including the removed association.
    raise exception 'Could not save process deletion. Nothing was deleted. Reload the blueprint and try again.' using errcode = '40001';
  end if;
  return query select v_saved.ok, v_saved.reason, v_saved.id, v_saved.name,
    v_saved.owner_user_id, v_saved.blueprint_json, v_saved.created_at,
    v_saved.updated_at, v_saved.version_no, v_saved.updated_by_user_id;
end;
$$;

revoke all on function private.guard_cbmx_process_link_removal() from public, anon, authenticated, service_role;
revoke all on function private.guard_cbmx_process_link_target() from public, anon, authenticated, service_role;
revoke all on function public.delete_cbmx_process_with_version(uuid,bigint,text,jsonb,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_cbmx_process_with_version(uuid,bigint,text,jsonb,text,uuid) to authenticated;

commit;
