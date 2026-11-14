-- Exact read-only inspection of the existing cbmx1 PCB save RPC, 2026-11-14.
-- Test fixture only; never apply to a hosted database.
CREATE OR REPLACE FUNCTION public.save_process_canvas_blueprint_with_version(p_process_canvas_blueprint_id uuid, p_loaded_version_no bigint, p_name text, p_blueprint_json jsonb)
 RETURNS TABLE(ok boolean, reason text, id uuid, owner_user_id uuid, name text, blueprint_json jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, version_no bigint, updated_by_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.process_canvas_blueprints%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select bm.role
    into v_role
  from public.process_canvas_blueprint_members bm
  where bm.process_canvas_blueprint_id = p_process_canvas_blueprint_id
    and bm.user_id = v_uid;

  if v_role is null then
    return query
    select
      false,
      'forbidden',
      null::uuid,
      null::uuid,
      null::text,
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
      null::uuid,
      null::text,
      null::jsonb,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::uuid;
    return;
  end if;

  update public.process_canvas_blueprints b
     set name = p_name,
         blueprint_json = p_blueprint_json,
         updated_by_user_id = v_uid
   where b.id = p_process_canvas_blueprint_id
     and b.version_no = p_loaded_version_no
  returning b.*
    into v_row;

  if found then
    return query
    select
      true,
      'ok',
      v_row.id,
      v_row.owner_user_id,
      v_row.name,
      v_row.blueprint_json,
      v_row.created_at,
      v_row.updated_at,
      v_row.version_no,
      v_row.updated_by_user_id;
    return;
  end if;

  if exists (
    select 1
    from public.process_canvas_blueprints b
    where b.id = p_process_canvas_blueprint_id
  ) then
    return query
    select
      false,
      'stale',
      null::uuid,
      null::uuid,
      null::text,
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
      null::uuid,
      null::text,
      null::jsonb,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::uuid;
end;
$function$
;

