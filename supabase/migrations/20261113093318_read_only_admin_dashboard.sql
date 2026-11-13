-- Incremental migration: requires the existing CBMX schema and its security fixes.
-- NOT a production baseline. See supabase/README.md before any hosted execution.
-- No administrator assignments, existing-policy changes, or blueprint writes.
begin;

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'Apply this migration as the trusted postgres maintenance role';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'postgres' and (rolsuper or rolbypassrls)
  ) then
    raise exception 'The postgres function owner must be able to read across existing RLS';
  end if;
  -- Best-effort check only: Data API schemas can also be configured outside SQL.
  -- A maintainer MUST independently verify that private is not exposed.
  if 'private' = any (pg_catalog.regexp_split_to_array(
    pg_catalog.replace(coalesce(pg_catalog.current_setting('pgrst.db_schemas', true), ''), '"', ''),
    '\s*,\s*'
  )) then
    raise exception 'Remove private from the Data API exposed schemas before deployment';
  end if;
  perform b.id, b.owner_user_id, b.name, b.created_at, b.updated_at from public.blueprints b limit 0;
  perform b.id, b.owner_user_id, b.name, b.created_at, b.updated_at from public.process_canvas_blueprints b limit 0;
  perform p.id, p.display_name from public.profiles p limit 0;
  perform u.id, u.email, u.created_at, u.raw_user_meta_data, u.email_confirmed_at,
          u.phone_confirmed_at, u.deleted_at, u.is_anonymous, u.banned_until
    from auth.users u limit 0;
  if exists (
    select 1 from pg_catalog.pg_class
    where oid in ('public.blueprints'::regclass, 'public.process_canvas_blueprints'::regclass)
      and not relrowsecurity
  ) then
    raise exception 'Existing blueprint RLS must be enabled before deployment';
  end if;
end;
$preflight$;

create schema if not exists private;

create table private.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default pg_catalog.now(),
  granted_by uuid references auth.users(id) on delete set null
);
alter table private.app_admins owner to postgres;
alter table private.app_admins enable row level security;
-- Intentionally no client RLS policies. Even service_role receives no table grant.
revoke all on table private.app_admins from public, anon, authenticated, service_role;

-- Internal helper is INVOKER: only the trusted owner of the public RPCs calls it.
-- A live registry lookup makes revocation effective on the next request, without
-- relying on potentially stale JWT claims. Banned/deleted/anonymous admins fail.
create function private.cbmx_admin_is_authorized()
returns boolean
language sql stable security invoker
set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1
    from private.app_admins a
    join auth.users u on u.id = a.user_id
    where a.user_id = auth.uid()
      and u.deleted_at is null
      and u.is_anonymous is not true
      and (u.banned_until is null or u.banned_until <= pg_catalog.statement_timestamp())
  );
$function$;
alter function private.cbmx_admin_is_authorized() owner to postgres;
revoke all on function private.cbmx_admin_is_authorized() from public, anon, authenticated, service_role;

create function public.admin_get_access()
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select private.cbmx_admin_is_authorized();
$function$;

create function public.admin_list_blueprints(
  p_search text default '',
  p_blueprint_type text default null,
  p_sort_by text default 'updated_at',
  p_sort_direction text default 'desc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  v_search text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));
  v_type text := pg_catalog.upper(p_blueprint_type);
  v_sort text := pg_catalog.lower(p_sort_by);
  v_direction text := pg_catalog.lower(p_sort_direction);
  v_offset bigint;
  v_result jsonb;
begin
  if not private.cbmx_admin_is_authorized() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 100 then
    raise exception 'page must be positive; page_size must be between 1 and 100' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_search, '')) > 200 then
    raise exception 'search must not exceed 200 characters' using errcode = '22023';
  end if;
  if v_type is not null and v_type not in ('CBMX', 'PC') then
    raise exception 'blueprint_type must be CBMX, PC, or null' using errcode = '22023';
  end if;
  if v_sort is null or v_sort not in ('blueprint_type', 'name', 'owner_name', 'owner_email', 'created_at', 'updated_at')
     or v_direction is null or v_direction not in ('asc', 'desc') then
    raise exception 'Unsupported sort column or direction' using errcode = '22023';
  end if;
  v_offset := (p_page::bigint - 1) * p_page_size;

  -- Only a whitelisted identifier and direction are interpolated. All search,
  -- filter, and pagination values are parameters. Literal substring search means
  -- %, _, backslashes, and SQL-looking input have no special meaning.
  execute pg_catalog.format($query$
    with inventory as (
      select 'CBMX'::text as blueprint_type, b.id as blueprint_id, b.name,
             b.owner_user_id, b.created_at, b.updated_at
      from public.blueprints b
      union all
      select 'PC'::text, b.id, b.name, b.owner_user_id, b.created_at, b.updated_at
      from public.process_canvas_blueprints b
    ), named as (
      select i.*,
             coalesce(nullif(pg_catalog.btrim(p.display_name), ''),
                      nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'display_name'), ''),
                      nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                      nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'name'), ''),
                      nullif(pg_catalog.split_part(u.email, '@', 1), ''), 'Unknown user') as owner_name,
             u.email as owner_email
      from inventory i
      left join auth.users u on u.id = i.owner_user_id
      left join public.profiles p on p.id = i.owner_user_id
    ), filtered as materialized (
      select * from named n
      where ($2::text is null or n.blueprint_type = $2)
        and ($1 = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(n.name, '')), $1) > 0
                    or pg_catalog.strpos(pg_catalog.lower(n.owner_name), $1) > 0
                    or pg_catalog.strpos(pg_catalog.lower(coalesce(n.owner_email, '')), $1) > 0)
    ), ranked as (
      select f.*, pg_catalog.row_number() over (
        order by f.%I %s nulls last, f.blueprint_type asc, f.blueprint_id asc
      ) as row_position
      from filtered f
    ), page_rows as (
      select * from ranked order by row_position limit $3 offset $4
    )
    select pg_catalog.jsonb_build_object(
      'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) - 'row_position' order by r.row_position) from page_rows r), '[]'::jsonb),
      'total_count', (select pg_catalog.count(*) from filtered),
      'page', $5::integer, 'page_size', $3::integer
    )
  $query$, v_sort, v_direction)
  into v_result using v_search, v_type, p_page_size, v_offset, p_page;
  return v_result;
end;
$function$;

create function public.admin_list_users(
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  v_search text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));
  v_offset bigint;
  v_result jsonb;
begin
  if not private.cbmx_admin_is_authorized() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 100 then
    raise exception 'page must be positive; page_size must be between 1 and 100' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_search, '')) > 200 then
    raise exception 'search must not exceed 200 characters' using errcode = '22023';
  end if;
  v_offset := (p_page::bigint - 1) * p_page_size;

  with cbmx_counts as (
    select b.owner_user_id, pg_catalog.count(*) as owned_cbmx_count
    from public.blueprints b group by b.owner_user_id
  ), pc_counts as (
    select b.owner_user_id, pg_catalog.count(*) as owned_pc_count
    from public.process_canvas_blueprints b group by b.owner_user_id
  ), registered as (
    select u.id as user_id, u.email,
           coalesce(nullif(pg_catalog.btrim(p.display_name), ''),
                    nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'display_name'), ''),
                    nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(pg_catalog.split_part(u.email, '@', 1), ''), 'Unknown user') as display_name,
           u.created_at as registration_date,
           (u.email_confirmed_at is not null or u.phone_confirmed_at is not null) as is_confirmed,
           (u.banned_until is not null and u.banned_until > pg_catalog.statement_timestamp()) as is_banned,
           coalesce(c.owned_cbmx_count, 0) as owned_cbmx_count,
           coalesce(pc.owned_pc_count, 0) as owned_pc_count
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join cbmx_counts c on c.owner_user_id = u.id
    left join pc_counts pc on pc.owner_user_id = u.id
    where u.deleted_at is null
      and u.is_anonymous is not true
  ), filtered as materialized (
    select * from registered r
    where v_search = '' or pg_catalog.strpos(pg_catalog.lower(r.display_name), v_search) > 0
                       or pg_catalog.strpos(pg_catalog.lower(coalesce(r.email, '')), v_search) > 0
  ), page_rows as (
    select * from filtered order by registration_date desc nulls last, user_id asc
    limit p_page_size offset v_offset
  )
  select pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.registration_date desc nulls last, r.user_id asc) from page_rows r), '[]'::jsonb),
    'total_count', (select pg_catalog.count(*) from filtered),
    'page', p_page, 'page_size', p_page_size
  ) into v_result;
  return v_result;
end;
$function$;

create function public.admin_get_statistics()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
begin
  if not private.cbmx_admin_is_authorized() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'total_registered_users', (
      select pg_catalog.count(*) from auth.users u
      where u.deleted_at is null and u.is_anonymous is not true
    ),
    'total_cbmx_blueprints', (select pg_catalog.count(*) from public.blueprints),
    'total_pc_blueprints', (select pg_catalog.count(*) from public.process_canvas_blueprints)
  );
end;
$function$;

alter function public.admin_get_access() owner to postgres;
alter function public.admin_list_blueprints(text, text, text, text, integer, integer) owner to postgres;
alter function public.admin_list_users(text, integer, integer) owner to postgres;
alter function public.admin_get_statistics() owner to postgres;

-- Scope revocations to the new functions; preserve all existing collaboration grants.
revoke all on function public.admin_get_access() from public, anon, authenticated, service_role;
revoke all on function public.admin_list_blueprints(text, text, text, text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_list_users(text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_statistics() from public, anon, authenticated, service_role;
grant execute on function public.admin_get_access() to authenticated;
grant execute on function public.admin_list_blueprints(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_get_statistics() to authenticated;

comment on table private.app_admins is 'Application reporting administrators; maintained only by trusted database operations. Not collaboration roles.';
comment on function public.admin_list_blueprints(text, text, text, text, integer, integer) is 'Admin-only metadata inventory. Does not return blueprint_json or grant direct table access.';
comment on function public.admin_list_users(text, integer, integer) is 'Admin-only non-deleted, non-anonymous Auth accounts, including banned and unconfirmed registrations. Reports is_banned. Counts ownership, not memberships.';

commit;
