-- Pending review. Read-only RPC; no memberships, write policies, or artifacts change.
begin;

do $$
begin
  if current_user <> 'postgres' or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'postgres' and (rolsuper or rolbypassrls)
  ) then raise exception 'Use the trusted postgres maintenance role'; end if;
  if to_regprocedure('private.cbmx_admin_is_authorized()') is null then
    raise exception 'The existing authoritative administrator registry is required';
  end if;
end;
$$;

create function public.admin_load_artifact(p_blueprint_type text, p_blueprint_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_type text := upper(p_blueprint_type);
  v_row jsonb;
  v_role text;
  v_links jsonb := '[]'::jsonb;
  v_context jsonb := null;
begin
  -- Check before looking up any artifact. User metadata and navigation context
  -- cannot authorize this endpoint; revocation is effective on the next call.
  if not private.cbmx_admin_is_authorized() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if v_type is null or v_type not in ('CBMX', 'PC') or p_blueprint_id is null then
    raise exception 'A valid artifact type and ID are required' using errcode = '22023';
  end if;

  if v_type = 'CBMX' then
    select jsonb_build_object('id', b.id, 'name', b.name, 'owner_user_id', b.owner_user_id,
      'blueprint_json', b.blueprint_json, 'created_at', b.created_at, 'updated_at', b.updated_at,
      'version_no', b.version_no, 'updated_by_user_id', b.updated_by_user_id),
      case when b.owner_user_id = v_uid then 'owner' else (
        select bm.role::text from public.blueprint_members bm
        where bm.blueprint_id = b.id and bm.user_id = v_uid) end
    into v_row, v_role from public.blueprints b where b.id = p_blueprint_id;
    if not found then raise exception 'Artifact not found' using errcode = 'P0002'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'cbmx_process_id', l.cbmx_process_id, 'link_exists', true,
      'process_canvas_blueprint_id', pcb.id, 'process_canvas_blueprint_name', pcb.name,
      'has_pcb_access', true,
      -- Effective read capability only. Admin viewing is not a membership and
      -- must never synthesize owner/editor rights on a linked PCB.
      'pcb_access_role', case when pcb.owner_user_id = v_uid then 'owner'
        else coalesce((select pm.role::text from public.process_canvas_blueprint_members pm
          where pm.process_canvas_blueprint_id = pcb.id and pm.user_id = v_uid), 'viewer') end
      ) order by l.cbmx_process_id), '[]'::jsonb) into v_links
    from public.cbmx_process_links l
    join public.process_canvas_blueprints pcb on pcb.id = l.process_canvas_blueprint_id
    where l.cbmx_blueprint_id = p_blueprint_id;
  else
    select jsonb_build_object('id', b.id, 'name', b.name, 'owner_user_id', b.owner_user_id,
      'blueprint_json', b.blueprint_json, 'created_at', b.created_at, 'updated_at', b.updated_at,
      'version_no', b.version_no, 'updated_by_user_id', b.updated_by_user_id),
      case when b.owner_user_id = v_uid then 'owner' else (
        select pm.role::text from public.process_canvas_blueprint_members pm
        where pm.process_canvas_blueprint_id = b.id and pm.user_id = v_uid) end
    into v_row, v_role from public.process_canvas_blueprints b where b.id = p_blueprint_id;
    if not found then raise exception 'Artifact not found' using errcode = 'P0002'; end if;

    select jsonb_build_object('link_id', l.id, 'cbmx_blueprint_id', b.id,
      'cbmx_process_id', l.cbmx_process_id, 'cbmx_blueprint_name', coalesce(b.name, 'Untitled blueprint'),
      'cbmx_process_name', coalesce((select nullif(p ->> 'name', '')
        from jsonb_array_elements(coalesce(b.blueprint_json -> 'coCreationProcesses', '[]'::jsonb)) p
        where p ->> 'id' = l.cbmx_process_id limit 1), l.cbmx_process_id))
    into v_context from public.cbmx_process_links l
    join public.blueprints b on b.id = l.cbmx_blueprint_id
    where l.process_canvas_blueprint_id = p_blueprint_id;
  end if;

  return jsonb_build_object('blueprint_type', v_type, 'row', v_row, 'role', v_role,
    'process_links', v_links, 'link_context', v_context);
end;
$$;

alter function public.admin_load_artifact(text,uuid) owner to postgres;
revoke all on function public.admin_load_artifact(text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_load_artifact(text,uuid) to authenticated;

commit;
