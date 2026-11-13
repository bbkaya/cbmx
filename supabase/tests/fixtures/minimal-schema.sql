-- TEST FIXTURE ONLY. Never apply this as a migration or to a hosted project.
-- Deliberately incomplete Supabase/CBMX stand-in, not a recovered schema baseline.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean default false,
  banned_until timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users,
  email text, display_name text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.blueprints (
  id uuid primary key,
  owner_user_id uuid references auth.users,
  name text,
  blueprint_json jsonb not null default '{"secret":"not admin inventory data"}',
  created_at timestamptz default now(), updated_at timestamptz default now(),
  version_no integer not null default 1
);
create table public.process_canvas_blueprints (like public.blueprints including all);
create table public.blueprint_members (
  blueprint_id uuid references public.blueprints,
  user_id uuid references auth.users,
  role text check (role in ('owner', 'editor', 'viewer')),
  primary key (blueprint_id, user_id)
);
create table public.process_canvas_blueprint_members (
  process_canvas_blueprint_id uuid references public.process_canvas_blueprints,
  user_id uuid references auth.users,
  role text check (role in ('owner', 'editor', 'viewer')),
  primary key (process_canvas_blueprint_id, user_id)
);

alter table public.blueprints enable row level security;
alter table public.process_canvas_blueprints enable row level security;
alter table public.profiles enable row level security;
alter table public.blueprint_members enable row level security;
alter table public.process_canvas_blueprint_members enable row level security;
grant select, insert, update, delete on all tables in schema public to authenticated;
create policy own_profile on public.profiles to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy own_membership on public.blueprint_members for select to authenticated using (user_id = auth.uid());
create policy own_membership on public.process_canvas_blueprint_members for select to authenticated using (user_id = auth.uid());

create policy blueprint_read on public.blueprints for select to authenticated using (
  owner_user_id = auth.uid() or exists (select 1 from public.blueprint_members m where m.blueprint_id = id and m.user_id = auth.uid())
);
create policy blueprint_insert on public.blueprints for insert to authenticated with check (owner_user_id = auth.uid());
create policy blueprint_update on public.blueprints for update to authenticated using (
  owner_user_id = auth.uid() or exists (select 1 from public.blueprint_members m where m.blueprint_id = id and m.user_id = auth.uid() and m.role = 'editor')
) with check (
  owner_user_id = auth.uid() or exists (select 1 from public.blueprint_members m where m.blueprint_id = id and m.user_id = auth.uid() and m.role = 'editor')
);
create policy blueprint_delete on public.blueprints for delete to authenticated using (owner_user_id = auth.uid());
create policy pcb_read on public.process_canvas_blueprints for select to authenticated using (
  owner_user_id = auth.uid() or exists (select 1 from public.process_canvas_blueprint_members m where m.process_canvas_blueprint_id = id and m.user_id = auth.uid())
);
create policy pcb_insert on public.process_canvas_blueprints for insert to authenticated with check (owner_user_id = auth.uid());
create policy pcb_update on public.process_canvas_blueprints for update to authenticated using (
  owner_user_id = auth.uid() or exists (select 1 from public.process_canvas_blueprint_members m where m.process_canvas_blueprint_id = id and m.user_id = auth.uid() and m.role = 'editor')
) with check (
  owner_user_id = auth.uid() or exists (select 1 from public.process_canvas_blueprint_members m where m.process_canvas_blueprint_id = id and m.user_id = auth.uid() and m.role = 'editor')
);
create policy pcb_delete on public.process_canvas_blueprints for delete to authenticated using (owner_user_id = auth.uid());

-- Versioned-save sentinel: intentionally a small stand-in, not the hosted function.
create function public.save_blueprint_with_version(p_id uuid, p_version integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.blueprints set version_no = version_no + 1 where id = p_id and version_no = p_version;
  return found;
end;
$$;
revoke all on function public.save_blueprint_with_version(uuid, integer) from public, anon;
grant execute on function public.save_blueprint_with_version(uuid, integer) to authenticated;

-- Simulate permissive legacy defaults to prove the migration explicitly revokes
-- privileges on every new object without changing existing default privileges.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema private;
alter default privileges in schema private grant all on tables to anon, authenticated, service_role;
alter default privileges in schema private grant execute on functions to anon, authenticated, service_role;
create function private.existing_helper() returns integer language sql as $$ select 1; $$;
grant usage on schema private to authenticated;
grant execute on function private.existing_helper() to authenticated;
