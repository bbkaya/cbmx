-- TEST ONLY. Extends the incomplete reporting fixture with the inspected RPCs.
alter table public.blueprints add column updated_by_user_id uuid references auth.users;
alter table public.blueprints alter column version_no type bigint;
alter table public.blueprints add unique (owner_user_id, name);
create table public.cbmx_process_links (
  id uuid primary key default gen_random_uuid(),
  cbmx_blueprint_id uuid not null references public.blueprints on delete cascade,
  cbmx_process_id text not null,
  process_canvas_blueprint_id uuid not null unique references public.process_canvas_blueprints on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint cbmx_process_links_cbmx_process_uq unique (cbmx_blueprint_id, cbmx_process_id)
);
alter table public.cbmx_process_links enable row level security;
grant select on public.cbmx_process_links to authenticated;
create policy links_read on public.cbmx_process_links for select to authenticated using (
  exists (select 1 from public.blueprints b where b.id = cbmx_blueprint_id)
  and exists (select 1 from public.process_canvas_blueprints p where p.id = process_canvas_blueprint_id)
);
