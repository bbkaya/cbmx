-- Executed ONLY by run-admin-tests.mjs against its disposable in-memory fixture.
-- Do not run fixture tests against any hosted project or real user database.
begin;

create temporary table reporting_data_before as
select 'CBMX'::text as kind, jsonb_agg(to_jsonb(b) order by b.id) as rows from public.blueprints b
union all
select 'PC', jsonb_agg(to_jsonb(b) order by b.id) from public.process_canvas_blueprints b
union all
select 'profiles', jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p;

create function pg_temp.assert_true(p_condition boolean, p_label text)
returns text language plpgsql security invoker as $$
begin
  if p_condition is distinct from true then raise exception 'FAIL: %', p_label; end if;
  return 'ok - ' || p_label;
end;
$$;
create function pg_temp.expect_error(p_sql text, p_state text, p_label text)
returns text language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return 'ok - ' || p_label; end if;
    raise exception 'FAIL: % (expected %, got %: %)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (expected error %)', p_label, p_state;
end;
$$;

select pg_temp.assert_true((select count(*) = 0 from private.app_admins), 'migration provisions no real or fixture administrators');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'private.app_admins', 'SELECT'), 'registry cannot be directly read');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'private.app_admins', 'INSERT'), 'registry cannot be directly inserted');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'private.app_admins', 'UPDATE'), 'registry cannot be directly updated');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'private.app_admins', 'DELETE'), 'registry cannot be directly deleted');
select pg_temp.assert_true(not has_table_privilege('service_role', 'private.app_admins', 'INSERT'), 'registry does not inherit legacy service-role grants');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid = 'private.app_admins'::regclass), 'registry has RLS enabled');
select pg_temp.assert_true((select count(*) = 0 from pg_policies where schemaname = 'private' and tablename = 'app_admins'), 'registry has no browser-access policies');
select pg_temp.assert_true((select bool_and(p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""'])
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'admin_%'), 'reporting functions are stable definers with empty search paths');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error('select public.admin_get_access()', '42501', 'anonymous capability call denied');
select pg_temp.expect_error('select public.admin_list_blueprints()', '42501', 'anonymous blueprint inventory denied');
select pg_temp.expect_error('select public.admin_list_users()', '42501', 'anonymous users inventory denied');
select pg_temp.expect_error('select public.admin_get_statistics()', '42501', 'anonymous statistics denied');

set local role authenticated;
select pg_temp.assert_true(public.admin_get_access() = false, 'authenticated role without a user ID has no access');
select pg_temp.expect_error('select public.admin_get_statistics()', '42501', 'missing auth.uid is rejected inside database');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(public.admin_get_access() = false, 'ordinary owner is not application admin');
select pg_temp.expect_error('select public.admin_list_blueprints()', '42501', 'non-admin blueprint inventory denied');
select pg_temp.expect_error('select public.admin_list_users()', '42501', 'non-admin users inventory denied');
select pg_temp.expect_error('select public.admin_get_statistics()', '42501', 'non-admin statistics denied');
select pg_temp.expect_error('select * from private.app_admins', '42501', 'registry direct query denied even with existing private-schema usage');
select pg_temp.expect_error($q$insert into private.app_admins (user_id) values ('00000000-0000-0000-0000-000000000002')$q$, '42501', 'self-assignment denied');
select pg_temp.expect_error($q$update private.app_admins set user_id = '00000000-0000-0000-0000-000000000002'$q$, '42501', 'registry update denied');
select pg_temp.expect_error('delete from private.app_admins', '42501', 'registry deletion denied');
select pg_temp.expect_error('select private.cbmx_admin_is_authorized()', '42501', 'internal authorization helper is not callable');
select pg_temp.expect_error('select * from auth.users', '42501', 'full Auth records are not directly exposed');

reset role;
update auth.users set raw_user_meta_data = '{"is_admin":true,"role":"admin"}' where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.assert_true(public.admin_get_access() = false, 'editable user metadata cannot grant privileges');
reset role;
insert into private.app_admins (user_id) values ('00000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(public.admin_get_access(), 'trusted registry assignment enables access');
select pg_temp.assert_true(public.admin_get_statistics() = '{"total_registered_users":6,"total_cbmx_blueprints":109,"total_pc_blueprints":3}'::jsonb, 'statistics include banned registered users, not only memberships');
select pg_temp.assert_true((public.admin_list_users() ->> 'total_count')::integer = 6, 'user definition matches statistics');
select pg_temp.assert_true((public.admin_list_blueprints() ->> 'total_count')::integer = 112, 'unified inventory total includes both tables');
select pg_temp.assert_true(jsonb_array_length(public.admin_list_blueprints() -> 'items') = 25, 'blueprint default page has 25 rows');
select pg_temp.assert_true(jsonb_array_length(public.admin_list_blueprints(p_page_size => 100) -> 'items') = 100, 'blueprint maximum page has 100 rows');
select pg_temp.assert_true((public.admin_list_blueprints(p_blueprint_type => 'CBMX') ->> 'total_count')::integer = 109, 'CBMX type filter');
select pg_temp.assert_true((public.admin_list_blueprints(p_blueprint_type => 'PC') ->> 'total_count')::integer = 3, 'PC type filter');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => 'OWNER PERSON') ->> 'total_count')::integer = 110, 'case-insensitive owner-name search');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => 'owner@cbmx.invalid') ->> 'total_count')::integer = 110, 'owner email comes from Auth, not stale profile email');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => 'stale-profile') ->> 'total_count')::integer = 0, 'stale profile email is not used');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => '  pending owner  ') ->> 'total_count')::integer = 2, 'name search trims surrounding whitespace');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => '%_') ->> 'total_count')::integer = 1, 'search percent and underscore are literal');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => $q$'; drop table public.blueprints; --$q$) ->> 'total_count')::integer = 0, 'SQL-looking search input is only data');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => null) ->> 'total_count')::integer = 112, 'null search means no filter');
select pg_temp.assert_true((select bool_and(not (r ? 'blueprint_json') and not (r ? 'row_position')) from jsonb_array_elements(public.admin_list_blueprints() -> 'items') r), 'inventory never returns blueprint JSON or internal ranking');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => 'Alpha CBMX') #>> '{items,0,created_at}')::timestamptz = '2026-01-01'::timestamptz, 'creation date uses database metadata');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => 'Alpha CBMX') #>> '{items,0,updated_at}')::timestamptz = '2026-02-01'::timestamptz, 'modification date uses database metadata');
select pg_temp.assert_true((public.admin_list_blueprints(p_search => 'Alpha') ->> 'total_count')::integer = 2, 'same UUID in different blueprint types remains two inventory rows');
select pg_temp.assert_true(public.admin_list_blueprints(p_page => 1000) -> 'items' = '[]'::jsonb and (public.admin_list_blueprints(p_page => 1000) ->> 'total_count')::integer = 112, 'empty out-of-range page still has matching total');
select pg_temp.assert_true((select count(*) = 0 from
  jsonb_array_elements(public.admin_list_blueprints(p_sort_by => 'created_at', p_sort_direction => 'asc', p_page => 1) -> 'items') a
  join jsonb_array_elements(public.admin_list_blueprints(p_sort_by => 'created_at', p_sort_direction => 'asc', p_page => 2) -> 'items') b
  on a ->> 'blueprint_id' = b ->> 'blueprint_id' and a ->> 'blueprint_type' = b ->> 'blueprint_type'), 'tie-broken pagination has no overlapping rows');

create function pg_temp.check_inventory_sorts() returns text language plpgsql security invoker as $$
declare
  sort_column text; direction text; item jsonb; previous_value text; current_value text; first_row boolean;
begin
  foreach sort_column in array array['blueprint_type','name','owner_name','owner_email','created_at','updated_at'] loop
    foreach direction in array array['asc','desc'] loop
      first_row := true;
      for item in select value from jsonb_array_elements(public.admin_list_blueprints(p_sort_by => sort_column, p_sort_direction => direction, p_page_size => 100) -> 'items') loop
        current_value := item ->> sort_column;
        if not first_row and current_value is not null then
          if previous_value is null or (direction = 'asc' and previous_value > current_value)
                                    or (direction = 'desc' and previous_value < current_value) then
            raise exception 'FAIL: sorting % %', sort_column, direction;
          end if;
        end if;
        previous_value := current_value;
        first_row := false;
      end loop;
    end loop;
  end loop;
  return 'ok - all six inventory sorts work in both directions';
end;
$$;
select pg_temp.check_inventory_sorts();

select pg_temp.assert_true((public.admin_list_users(p_search => 'Metadata Only') ->> 'total_count')::integer = 1, 'registered user without profile is searchable by metadata name');
select pg_temp.assert_true(public.admin_list_users(p_search => 'pending@') #>> '{items,0,display_name}' = 'Metadata Only', 'missing profile retains Auth display name');
select pg_temp.assert_true(public.admin_list_users(p_search => 'pending@') #>> '{items,0,is_confirmed}' = 'false', 'unconfirmed registrations are included and identified');
select pg_temp.assert_true(public.admin_list_users(p_search => 'Phone User') #>> '{items,0,is_confirmed}' = 'true', 'phone-confirmed users are identified');
select pg_temp.assert_true((public.admin_list_users(p_search => 'owner@') #>> '{items,0,registration_date}')::timestamptz = '2026-02-01'::timestamptz, 'registration date comes from Auth, not profile');
select pg_temp.assert_true((public.admin_list_users(p_search => 'owner@') #>> '{items,0,owned_cbmx_count}')::integer = 108 and (public.admin_list_users(p_search => 'owner@') #>> '{items,0,owned_pc_count}')::integer = 2, 'independent ownership aggregates do not multiply counts');
select pg_temp.assert_true((public.admin_list_users(p_search => 'admin@') #>> '{items,0,owned_cbmx_count}')::integer = 0 and (public.admin_list_users(p_search => 'admin@') #>> '{items,0,owned_pc_count}')::integer = 0, 'shared viewer memberships are not counted as ownership');
select pg_temp.assert_true((public.admin_list_users(p_search => 'anonymous@') ->> 'total_count')::integer = 0, 'anonymous accounts excluded');
select pg_temp.assert_true((public.admin_list_users(p_search => 'deleted@') ->> 'total_count')::integer = 0, 'soft-deleted accounts excluded');
select pg_temp.assert_true((public.admin_list_users(p_search => 'banned@') ->> 'total_count')::integer = 1, 'currently banned accounts remain in the user inventory');
select pg_temp.assert_true(public.admin_list_users(p_search => 'banned@') #> '{items,0,is_banned}' = 'true'::jsonb, 'current ban is returned as a true boolean');
select pg_temp.assert_true(public.admin_list_users(p_search => 'expired-ban@') #> '{items,0,is_banned}' = 'false'::jsonb, 'expired ban is returned as a false boolean');
select pg_temp.assert_true(public.admin_list_users(p_search => 'owner@') #> '{items,0,is_banned}' = 'false'::jsonb, 'missing ban is returned as a false boolean');
select pg_temp.assert_true(public.admin_list_users(p_search => 'pending@') #> '{items,0,is_banned}' = 'false'::jsonb, 'unconfirmed account without a ban remains not banned');
select pg_temp.assert_true((select bool_and(jsonb_typeof(r -> 'is_banned') = 'boolean') from jsonb_array_elements(public.admin_list_users() -> 'items') r), 'every user record includes a boolean is_banned');
select pg_temp.assert_true((public.admin_list_users(p_search => 'expired-ban@') ->> 'total_count')::integer = 1, 'expired bans do not exclude registered accounts');
select pg_temp.assert_true(jsonb_array_length(public.admin_list_users(p_page_size => 2) -> 'items') = 2 and (public.admin_list_users(p_page_size => 2) ->> 'total_count')::integer = 6, 'user pagination reports total independently of page size');
select pg_temp.assert_true(public.admin_list_users(p_page => 1000) -> 'items' = '[]'::jsonb and (public.admin_list_users(p_page => 1000) ->> 'total_count')::integer = 6, 'empty user page still returns total');

select pg_temp.expect_error('select public.admin_list_blueprints(p_page => 0)', '22023', 'invalid page rejected');
select pg_temp.expect_error('select public.admin_list_blueprints(p_page_size => 101)', '22023', 'oversized page rejected');
select pg_temp.expect_error('select public.admin_list_blueprints(p_page_size => null)', '22023', 'null page size rejected');
select pg_temp.expect_error($q$select public.admin_list_blueprints(p_sort_by => 'name;delete from auth.users')$q$, '22023', 'sort-column injection rejected');
select pg_temp.expect_error($q$select public.admin_list_blueprints(p_sort_direction => 'asc;delete')$q$, '22023', 'sort-direction injection rejected');
select pg_temp.expect_error($q$select public.admin_list_blueprints(p_blueprint_type => 'Other')$q$, '22023', 'unsupported type rejected');
select pg_temp.expect_error($q$select public.admin_list_blueprints(p_search => repeat('x',201))$q$, '22023', 'oversized inventory search rejected');
select pg_temp.expect_error('select public.admin_list_users(p_page => -1)', '22023', 'invalid user page rejected');
select pg_temp.expect_error('select public.admin_list_users(p_page_size => 101)', '22023', 'oversized user page rejected');
select pg_temp.expect_error($q$select public.admin_list_users(p_search => repeat('x',201))$q$, '22023', 'oversized user search rejected');

reset role;
select pg_temp.assert_true((select rows from reporting_data_before where kind = 'CBMX') =
  (select jsonb_agg(to_jsonb(b) order by b.id) from public.blueprints b), 'reporting leaves CBMX data and versions unchanged');
select pg_temp.assert_true((select rows from reporting_data_before where kind = 'PC') =
  (select jsonb_agg(to_jsonb(b) order by b.id) from public.process_canvas_blueprints b), 'reporting leaves PC data and versions unchanged');
select pg_temp.assert_true((select rows from reporting_data_before where kind = 'profiles') =
  (select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p), 'reporting does not create or update profiles');
set local role authenticated;

-- The administrator is a viewer on one blueprint of each type and has no access
-- to the other records, despite being able to inventory all of their metadata.
select pg_temp.assert_true((select count(*) = 1 from public.blueprints), 'admin does not gain broad direct CBMX SELECT');
select pg_temp.assert_true((select count(*) = 1 from public.process_canvas_blueprints), 'admin does not gain broad direct PC SELECT');
select pg_temp.assert_true((select count(*) = 0 from public.blueprints where name = 'Zulu CBMX'), 'unshared blueprint contents remain inaccessible');
with changed as (update public.blueprints set name = 'Forbidden' returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'admin cannot UPDATE others CBMX blueprints');
with changed as (delete from public.blueprints returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'admin cannot DELETE others CBMX blueprints');
with changed as (update public.process_canvas_blueprints set name = 'Forbidden' returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'admin cannot UPDATE others PC blueprints');
with changed as (delete from public.process_canvas_blueprints returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'admin cannot DELETE others PC blueprints');
select pg_temp.expect_error($q$insert into public.blueprint_members values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','owner')$q$, '42501', 'admin cannot self-insert collaboration ownership');
select pg_temp.assert_true(not public.save_blueprint_with_version('10000000-0000-0000-0000-000000000001', 1), 'viewer admin cannot use existing versioned save');
select pg_temp.expect_error($q$insert into private.app_admins (user_id) values ('00000000-0000-0000-0000-000000000003')$q$, '42501', 'reporting admin cannot assign another administrator');

-- Ordinary owner/editor/viewer behavior still operates independently of admin.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(public.save_blueprint_with_version('10000000-0000-0000-0000-000000000001',1), 'existing owner can still save');
select pg_temp.assert_true(not public.save_blueprint_with_version('10000000-0000-0000-0000-000000000001',1), 'stale version remains rejected');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select pg_temp.assert_true(public.save_blueprint_with_version('10000000-0000-0000-0000-000000000002',1), 'ordinary shared editor can still save');

reset role;
delete from private.app_admins where user_id = '00000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(not public.admin_get_access(), 'revocation is visible without refreshing identity claims');
select pg_temp.expect_error('select public.admin_list_blueprints()', '42501', 'revoked administrator inventory denied');
select pg_temp.expect_error('select public.admin_list_users()', '42501', 'revoked administrator users denied');
select pg_temp.expect_error('select public.admin_get_statistics()', '42501', 'revoked administrator statistics denied');

reset role;
insert into private.app_admins (user_id) values ('00000000-0000-0000-0000-000000000001');
update auth.users set banned_until = 'infinity' where id = '00000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not public.admin_get_access(), 'banned administrator is denied even with old identity claims');
select pg_temp.expect_error('select public.admin_list_users()', '42501', 'banned administrator cannot list registered users');
select pg_temp.expect_error('select public.admin_list_blueprints()', '42501', 'banned administrator cannot list blueprint inventory');
select pg_temp.expect_error('select public.admin_get_statistics()', '42501', 'banned administrator cannot report');
reset role;
update auth.users set banned_until = null, deleted_at = now() where id = '00000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not public.admin_get_access(), 'soft-deleted administrator is denied');
reset role;
update auth.users set deleted_at = null, is_anonymous = true where id = '00000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not public.admin_get_access(), 'anonymous administrator record cannot authorize access');

rollback;
