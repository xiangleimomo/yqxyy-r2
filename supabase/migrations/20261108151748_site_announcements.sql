-- Apply when the announcement feature is released; local preview uses browser storage.
create table public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 5000),
  kind text not null default 'notice' check (kind in ('notice','activity','greeting')),
  reward_note text not null default '' check (length(reward_note)<=500),
  pinned boolean not null default false,
  published boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint announcement_dates check (starts_at is null or ends_at is null or ends_at>starts_at)
);
alter table public.site_announcements enable row level security;
grant select on public.site_announcements to anon, authenticated;
grant insert, update, delete on public.site_announcements to authenticated;
create policy announcements_visible on public.site_announcements for select to anon, authenticated
using (published and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()));
create policy announcements_admin_read on public.site_announcements for select to authenticated
using ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
create policy announcements_admin_insert on public.site_announcements for insert to authenticated
with check ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
create policy announcements_admin_update on public.site_announcements for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'site_admin')='true')
with check ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
create policy announcements_admin_delete on public.site_announcements for delete to authenticated
using ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
create index announcements_published_order on public.site_announcements (pinned desc, created_at desc) where published;
