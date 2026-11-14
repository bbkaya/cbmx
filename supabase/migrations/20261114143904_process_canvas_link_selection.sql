-- Pending review. Schema only; no historical associations or PCB contents change.
begin;

do $$
begin
  if current_user <> 'postgres' then raise exception 'Run this migration as the trusted postgres role'; end if;
  if to_regprocedure('public.upsert_cbmx_process_link(uuid,text,uuid)') is null then
    raise exception 'The existing PCB link RPC is required';
  end if;
  -- Reuse the actual immediate unique constraints; do not add duplicates.
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.cbmx_process_links'::regclass
    and c.contype = 'u' and not c.condeferrable and c.conkey = array[
      (select attnum from pg_attribute where attrelid = c.conrelid and attname = 'process_canvas_blueprint_id')])
    or not exists (select 1 from pg_constraint c where c.conrelid = 'public.cbmx_process_links'::regclass
      and c.contype = 'u' and not c.condeferrable and c.conkey = array[
        (select attnum from pg_attribute where attrelid = c.conrelid and attname = 'cbmx_blueprint_id'),
        (select attnum from pg_attribute where attrelid = c.conrelid and attname = 'cbmx_process_id')]) then
    raise exception 'Immediate unique constraints on PCB and (CBMX, process) are required';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.cbmx_process_links'::regclass
    and tgname = 'guard_cbmx_process_link_target' and tgenabled = 'O') then
    raise exception 'The safe process deletion migration must be installed first';
  end if;
end;
$$;

-- A definer must see ALL links, including those whose source CBMX is hidden.
-- Return only editable, unlinked PCB metadata, never the other link's context.
create function public.get_cbmx_process_canvas_options(p_cbmx_blueprint_id uuid, p_cbmx_process_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_json jsonb;
  v_current_id uuid;
  v_current jsonb := null;
  v_canvases jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select b.blueprint_json into v_json from public.blueprints b
  where b.id = p_cbmx_blueprint_id and (b.owner_user_id = v_uid or exists (
    select 1 from public.blueprint_members bm where bm.blueprint_id = b.id
      and bm.user_id = v_uid and bm.role in ('owner', 'editor')));
  if not found then raise exception 'CBMX edit access is required' using errcode = '42501'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_json -> 'coCreationProcesses', '[]'::jsonb)) p
    where p ->> 'id' = p_cbmx_process_id) then
    raise exception 'The process must exist in the saved blueprint' using errcode = '22023';
  end if;

  select l.process_canvas_blueprint_id into v_current_id from public.cbmx_process_links l
  where l.cbmx_blueprint_id = p_cbmx_blueprint_id and l.cbmx_process_id = p_cbmx_process_id;
  if v_current_id is not null then
    select jsonb_build_object('id', pcb.id, 'name', pcb.name) into v_current
    from public.process_canvas_blueprints pcb where pcb.id = v_current_id
      and (pcb.owner_user_id = v_uid or exists (select 1 from public.process_canvas_blueprint_members pm
        where pm.process_canvas_blueprint_id = pcb.id and pm.user_id = v_uid and pm.role in ('owner', 'editor')));
    if not found then raise exception 'Edit access to the currently linked Canvas is required' using errcode = '42501'; end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', pcb.id, 'name', pcb.name,
    'role', case when pcb.owner_user_id = v_uid then 'owner' else 'editor' end)
    order by lower(pcb.name), pcb.name, pcb.id), '[]'::jsonb) into v_canvases
  from public.process_canvas_blueprints pcb
  where (pcb.owner_user_id = v_uid or exists (select 1 from public.process_canvas_blueprint_members pm
    where pm.process_canvas_blueprint_id = pcb.id and pm.user_id = v_uid and pm.role in ('owner', 'editor')))
    and not exists (select 1 from public.cbmx_process_links l where l.process_canvas_blueprint_id = pcb.id);
  return jsonb_build_object('current_canvas', v_current, 'canvases', v_canvases);
end;
$$;

-- Recheck edit rights and global availability at confirmation time. Lock in the
-- same order as process deletion: blueprint, then its link. The existing link
-- trigger serializes legacy writes with this blueprint lock as well.
create function public.link_available_cbmx_process_canvas(
  p_cbmx_blueprint_id uuid,
  p_cbmx_process_id text,
  p_process_canvas_blueprint_id uuid,
  p_expected_current_pcb_id uuid
)
returns table(cbmx_blueprint_id uuid, cbmx_process_id text, process_canvas_blueprint_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_json jsonb;
  v_current_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select b.blueprint_json into v_json from public.blueprints b
  where b.id = p_cbmx_blueprint_id and (b.owner_user_id = v_uid or exists (
    select 1 from public.blueprint_members bm where bm.blueprint_id = b.id
      and bm.user_id = v_uid and bm.role in ('owner', 'editor'))) for update;
  if not found then raise exception 'CBMX edit access is required' using errcode = '42501'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_json -> 'coCreationProcesses', '[]'::jsonb)) p
    where p ->> 'id' = p_cbmx_process_id) then
    raise exception 'The process must exist in the saved blueprint' using errcode = '22023';
  end if;

  select l.process_canvas_blueprint_id into v_current_id from public.cbmx_process_links l
  where l.cbmx_blueprint_id = p_cbmx_blueprint_id and l.cbmx_process_id = p_cbmx_process_id for update;
  if v_current_id is distinct from p_expected_current_pcb_id then
    raise exception 'The current Canvas association changed' using errcode = '40001';
  end if;
  if v_current_id is not null and not exists (select 1 from public.process_canvas_blueprints pcb
    where pcb.id = v_current_id and (pcb.owner_user_id = v_uid or exists (
      select 1 from public.process_canvas_blueprint_members pm where pm.process_canvas_blueprint_id = pcb.id
        and pm.user_id = v_uid and pm.role in ('owner', 'editor')))) then
    raise exception 'Edit access to the currently linked Canvas is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.process_canvas_blueprints pcb
    where pcb.id = p_process_canvas_blueprint_id and (pcb.owner_user_id = v_uid or exists (
      select 1 from public.process_canvas_blueprint_members pm where pm.process_canvas_blueprint_id = pcb.id
        and pm.user_id = v_uid and pm.role in ('owner', 'editor')))) then
    raise exception 'Edit access to the selected Canvas is required' using errcode = '42501';
  end if;
  if exists (select 1 from public.cbmx_process_links l where l.process_canvas_blueprint_id = p_process_canvas_blueprint_id) then
    raise exception 'The selected Canvas is no longer available' using errcode = '23505';
  end if;
  -- ON CONFLICT updates the process's existing row in one statement. The global
  -- PCB unique constraint arbitrates concurrent claims from different blueprints.
  -- Never unlink first: any error leaves the previous association intact.
  return query select * from public.upsert_cbmx_process_link(p_cbmx_blueprint_id, p_cbmx_process_id, p_process_canvas_blueprint_id);
exception when unique_violation then
  raise exception 'The selected Canvas is no longer available' using errcode = '23505';
end;
$$;

revoke all on function public.get_cbmx_process_canvas_options(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.link_available_cbmx_process_canvas(uuid,text,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_cbmx_process_canvas_options(uuid,text) to authenticated;
grant execute on function public.link_available_cbmx_process_canvas(uuid,text,uuid,uuid) to authenticated;

commit;
