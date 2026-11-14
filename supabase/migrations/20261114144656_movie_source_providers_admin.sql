-- Shared playback-provider templates. The database migration has already been
-- applied as Supabase migration 20261114144656_movie_source_providers_admin.
-- The public can read enabled sources; only site admins can modify entries.
create table if not exists public.movie_source_providers (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) between 1 and 80),
  movie_url text not null,
  tv_url text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movie_source_providers_movie_url_check check (
    char_length(movie_url) between 18 and 2048
    and movie_url like 'https://%'
    and position('{tmdbId}' in movie_url) > 0
    and movie_url !~ '[[:space:]]'
  ),
  constraint movie_source_providers_tv_url_check check (
    tv_url = '' or (
      char_length(tv_url) between 20 and 2048
      and tv_url like 'https://%'
      and position('{tmdbId}' in tv_url) > 0
      and position('{seasonNumber}' in tv_url) > 0
      and position('{episodeNumber}' in tv_url) > 0
      and tv_url !~ '[[:space:]]'
    )
  )
);
alter table public.movie_source_providers enable row level security;
revoke all on public.movie_source_providers from anon,authenticated;
grant select on public.movie_source_providers to anon,authenticated;
grant insert,update,delete on public.movie_source_providers to authenticated;
grant usage,select on sequence public.movie_source_providers_id_seq to authenticated;
create policy "movie_source_providers_visible" on public.movie_source_providers
for select to anon,authenticated
using (enabled or (select auth.jwt()->'app_metadata'->>'site_admin')='true');
create policy "movie_source_providers_admin_insert" on public.movie_source_providers
for insert to authenticated
with check ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
create policy "movie_source_providers_admin_update" on public.movie_source_providers
for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'site_admin')='true')
with check ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
create policy "movie_source_providers_admin_delete" on public.movie_source_providers
for delete to authenticated
using ((select auth.jwt()->'app_metadata'->>'site_admin')='true');
