-- Read-only schema inspection of cbmx1 on 2026-11-14.
-- Exact function bodies used by the isolated regression fixture, not a migration.
-- No production blueprint contents, accounts, or credentials.

CREATE OR REPLACE FUNCTION public.bump_version_and_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.version_no := coalesce(old.version_no, 0) + 1;
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_cbmx_process_links_with_access(p_cbmx_blueprint_id uuid)
 RETURNS TABLE(cbmx_process_id text, link_exists boolean, process_canvas_blueprint_id uuid, process_canvas_blueprint_name text, pcb_access_role text, has_pcb_access boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.blueprints b
    where b.id = p_cbmx_blueprint_id
      and (
        b.owner_user_id = v_uid
        or exists (
          select 1
          from public.blueprint_members bm
          where bm.blueprint_id = b.id
            and bm.user_id = v_uid
        )
      )
  ) then
    raise exception 'You do not have access to this CBMX blueprint';
  end if;

  return query
  with links as (
    select
      l.cbmx_process_id,
      l.process_canvas_blueprint_id
    from public.cbmx_process_links l
    where l.cbmx_blueprint_id = p_cbmx_blueprint_id
  ),
  pcb_access as (
    select
      l.cbmx_process_id,
      l.process_canvas_blueprint_id,
      pcb.name as process_canvas_blueprint_name,
      case
        when pcb.owner_user_id = v_uid then 'owner'::text
        when pm.role is not null then pm.role::text
        else null::text
      end as pcb_access_role
    from links l
    left join public.process_canvas_blueprints pcb
      on pcb.id = l.process_canvas_blueprint_id
    left join public.process_canvas_blueprint_members pm
      on pm.process_canvas_blueprint_id = l.process_canvas_blueprint_id
     and pm.user_id = v_uid
  )
  select
    pa.cbmx_process_id::text as cbmx_process_id,
    true::boolean as link_exists,
    pa.process_canvas_blueprint_id::uuid as process_canvas_blueprint_id,
    (
      case
        when pa.pcb_access_role is not null
          then coalesce(nullif(trim(pa.process_canvas_blueprint_name), ''), pa.process_canvas_blueprint_id::text)
        else null
      end
    )::text as process_canvas_blueprint_name,
    pa.pcb_access_role::text as pcb_access_role,
    (pa.pcb_access_role is not null)::boolean as has_pcb_access
  from pcb_access pa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_blueprint_with_version(p_blueprint_id uuid, p_loaded_version_no bigint, p_name text, p_blueprint_json jsonb)
 RETURNS TABLE(ok boolean, reason text, id uuid, name text, owner_user_id uuid, blueprint_json jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, version_no bigint, updated_by_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.blueprints%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select bm.role
    into v_role
  from public.blueprint_members bm
  where bm.blueprint_id = p_blueprint_id
    and bm.user_id = v_uid;

  if v_role is null then
    return query
    select
      false,
      'forbidden',
      null::uuid,
      null::text,
      null::uuid,
      null::jsonb,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::uuid;
    return;
  end if;

  if v_role not in ('owner', 'editor') then
    return query
    select
      false,
      'forbidden',
      null::uuid,
      null::text,
      null::uuid,
      null::jsonb,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::uuid;
    return;
  end if;

  update public.blueprints b
     set name = p_name,
         blueprint_json = p_blueprint_json,
         updated_by_user_id = v_uid
   where b.id = p_blueprint_id
     and b.version_no = p_loaded_version_no
  returning b.*
    into v_row;

  if found then
    return query
    select
      true,
      'ok',
      v_row.id,
      v_row.name,
      v_row.owner_user_id,
      v_row.blueprint_json,
      v_row.created_at,
      v_row.updated_at,
      v_row.version_no,
      v_row.updated_by_user_id;
    return;
  end if;

  if exists (
    select 1
    from public.blueprints b
    where b.id = p_blueprint_id
  ) then
    return query
    select
      false,
      'stale',
      null::uuid,
      null::text,
      null::uuid,
      null::jsonb,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::uuid;
    return;
  end if;

  return query
  select
    false,
    'not_found',
    null::uuid,
    null::text,
    null::uuid,
    null::jsonb,
    null::timestamptz,
    null::timestamptz,
    null::bigint,
    null::uuid;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.unlink_cbmx_process_link(p_cbmx_blueprint_id uuid, p_cbmx_process_id text)
 RETURNS TABLE(cbmx_blueprint_id uuid, cbmx_process_id text, removed_process_canvas_blueprint_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing_pcb_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_cbmx_blueprint_id is null or p_cbmx_process_id is null then
    raise exception 'Missing required arguments';
  end if;

  if not exists (
    select 1
    from public.blueprints b
    left join public.blueprint_members bm
      on bm.blueprint_id = b.id
     and bm.user_id = v_uid
    where b.id = p_cbmx_blueprint_id
      and (
        b.owner_user_id = v_uid
        or bm.role in ('owner', 'editor')
      )
  ) then
    raise exception 'You do not have edit access to this CBMX blueprint';
  end if;

  if not exists (
    select 1
    from public.blueprints b
    cross join lateral jsonb_array_elements(
      coalesce((b.blueprint_json::jsonb -> 'coCreationProcesses'), '[]'::jsonb)
    ) as p
    where b.id = p_cbmx_blueprint_id
      and coalesce(p ->> 'id', '') = p_cbmx_process_id
  ) then
    raise exception 'The specified co-creation process does not belong to the CBMX blueprint';
  end if;

  select l.process_canvas_blueprint_id
    into v_existing_pcb_id
  from public.cbmx_process_links l
  where l.cbmx_blueprint_id = p_cbmx_blueprint_id
    and l.cbmx_process_id = p_cbmx_process_id;

  if v_existing_pcb_id is null then
    raise exception 'There is no linked Process Canvas for this co-creation process';
  end if;

  if not exists (
    select 1
    from public.process_canvas_blueprints pcb
    left join public.process_canvas_blueprint_members pm
      on pm.process_canvas_blueprint_id = pcb.id
     and pm.user_id = v_uid
    where pcb.id = v_existing_pcb_id
      and (
        pcb.owner_user_id = v_uid
        or pm.role in ('owner', 'editor')
      )
  ) then
    raise exception 'You do not have edit access to the linked Process Canvas';
  end if;

  delete from public.cbmx_process_links l
  where l.cbmx_blueprint_id = p_cbmx_blueprint_id
    and l.cbmx_process_id = p_cbmx_process_id;

  return query
  select
    p_cbmx_blueprint_id,
    p_cbmx_process_id,
    v_existing_pcb_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.upsert_cbmx_process_link(p_cbmx_blueprint_id uuid, p_cbmx_process_id text, p_process_canvas_blueprint_id uuid)
 RETURNS TABLE(cbmx_blueprint_id uuid, cbmx_process_id text, process_canvas_blueprint_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing_pcb_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_cbmx_blueprint_id is null or p_cbmx_process_id is null or p_process_canvas_blueprint_id is null then
    raise exception 'Missing required arguments';
  end if;

  if not exists (
    select 1
    from public.blueprints b
    left join public.blueprint_members bm
      on bm.blueprint_id = b.id
     and bm.user_id = v_uid
    where b.id = p_cbmx_blueprint_id
      and (
        b.owner_user_id = v_uid
        or bm.role in ('owner', 'editor')
      )
  ) then
    raise exception 'You do not have edit access to this CBMX blueprint';
  end if;

  if not exists (
    select 1
    from public.blueprints b
    cross join lateral jsonb_array_elements(
      coalesce((b.blueprint_json::jsonb -> 'coCreationProcesses'), '[]'::jsonb)
    ) as p
    where b.id = p_cbmx_blueprint_id
      and coalesce(p ->> 'id', '') = p_cbmx_process_id
  ) then
    raise exception 'The specified co-creation process does not belong to the CBMX blueprint';
  end if;

  if not exists (
    select 1
    from public.process_canvas_blueprints pcb
    left join public.process_canvas_blueprint_members pm
      on pm.process_canvas_blueprint_id = pcb.id
     and pm.user_id = v_uid
    where pcb.id = p_process_canvas_blueprint_id
      and (
        pcb.owner_user_id = v_uid
        or pm.role in ('owner', 'editor')
      )
  ) then
    raise exception 'You do not have edit access to the target Process Canvas';
  end if;

  select l.process_canvas_blueprint_id
    into v_existing_pcb_id
  from public.cbmx_process_links as l
  where l.cbmx_blueprint_id = p_cbmx_blueprint_id
    and l.cbmx_process_id = p_cbmx_process_id;

  if v_existing_pcb_id is not null then
    if not exists (
      select 1
      from public.process_canvas_blueprints pcb
      left join public.process_canvas_blueprint_members pm
        on pm.process_canvas_blueprint_id = pcb.id
       and pm.user_id = v_uid
      where pcb.id = v_existing_pcb_id
        and (
          pcb.owner_user_id = v_uid
          or pm.role in ('owner', 'editor')
        )
    ) then
      raise exception 'This co-creation process is already linked to a Process Canvas that you cannot edit';
    end if;
  end if;

  insert into public.cbmx_process_links as cpl (
    cbmx_blueprint_id,
    cbmx_process_id,
    process_canvas_blueprint_id
  )
  values (
    p_cbmx_blueprint_id,
    p_cbmx_process_id,
    p_process_canvas_blueprint_id
  )
  on conflict on constraint cbmx_process_links_cbmx_process_uq
  do update set
    process_canvas_blueprint_id = excluded.process_canvas_blueprint_id,
    updated_at = now();

  return query
  select
    cpl.cbmx_blueprint_id::uuid,
    cpl.cbmx_process_id::text,
    cpl.process_canvas_blueprint_id::uuid
  from public.cbmx_process_links as cpl
  where cpl.cbmx_blueprint_id = p_cbmx_blueprint_id
    and cpl.cbmx_process_id = p_cbmx_process_id;
end;
$function$
;
