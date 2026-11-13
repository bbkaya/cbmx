-- Synthetic .invalid accounts only. This file is loaded only by the in-memory runner.
insert into auth.users (id, email, created_at, raw_user_meta_data, email_confirmed_at,
                        phone_confirmed_at, deleted_at, is_anonymous, banned_until)
values
 ('00000000-0000-0000-0000-000000000001', 'admin@cbmx.invalid', '2026-01-01', '{"display_name":"Admin Reporter"}', '2026-01-01', null, null, false, null),
 ('00000000-0000-0000-0000-000000000002', 'owner@cbmx.invalid', '2026-02-01', '{}', '2026-02-01', null, null, false, null),
 ('00000000-0000-0000-0000-000000000003', 'pending@cbmx.invalid', '2026-03-01', '{"display_name":"Metadata Only"}', null, null, null, false, null),
 ('00000000-0000-0000-0000-000000000004', 'anonymous@cbmx.invalid', '2026-04-01', '{}', null, null, null, true, null),
 ('00000000-0000-0000-0000-000000000005', 'deleted@cbmx.invalid', '2026-05-01', '{}', null, null, '2026-06-01', false, null),
 ('00000000-0000-0000-0000-000000000006', 'banned@cbmx.invalid', '2026-06-01', '{}', '2026-06-01', null, null, false, 'infinity'),
 ('00000000-0000-0000-0000-000000000007', 'expired-ban@cbmx.invalid', '2026-07-01', '{}', '2026-07-01', null, null, false, '2020-01-01'),
 ('00000000-0000-0000-0000-000000000008', null, '2026-08-01', '{"full_name":"Phone User"}', null, '2026-08-01', null, false, null);
insert into public.profiles (id, email, display_name, created_at) values
 ('00000000-0000-0000-0000-000000000001', 'admin@cbmx.invalid', 'Admin Reporter', '2026-10-01'),
 ('00000000-0000-0000-0000-000000000002', 'stale-profile@cbmx.invalid', 'Owner Person', '2026-10-01');
insert into public.blueprints (id, owner_user_id, name, created_at, updated_at) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Alpha CBMX', '2026-01-01', '2026-02-01'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Zulu CBMX', '2026-02-01', '2026-03-01'),
 ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '100%_literal', '2026-03-01', '2026-04-01'),
 ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'Pending Owner Blueprint', '2026-04-01', '2026-05-01');
insert into public.blueprints (id, owner_user_id, name, created_at, updated_at)
select ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000002', 'Generated ' || lpad(n::text, 3, '0'),
       '2026-01-01'::timestamptz, '2026-01-01'::timestamptz
from generate_series(1, 105) n;
insert into public.process_canvas_blueprints (id, owner_user_id, name, created_at, updated_at) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Alpha PC', '2026-01-01', '2026-02-01'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Zulu PC', '2026-02-01', '2026-03-01'),
 ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'Pending Owner PC', '2026-04-01', '2026-05-01');
insert into public.blueprint_members values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'viewer'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'editor');
insert into public.process_canvas_blueprint_members values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'viewer');
