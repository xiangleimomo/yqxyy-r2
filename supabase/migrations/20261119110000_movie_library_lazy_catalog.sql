-- Public, read-only browse indexes. Never expose unpublished rows or bypass table RLS.
-- Movies remain one item; TV shows become one item per (category, TMDB ID).
create or replace view public.movie_library_catalog
with (security_invoker = true)
as
select id, category, media_type, tmdb_id, title, title_zh, year,
       poster_url, overview, season_number, episode_number,
       published, sort_order, playback_sources, episode_count
from (
  select m.id, m.category, m.media_type, m.tmdb_id, m.title, m.title_zh,
         m.year, m.poster_url, m.overview, m.season_number, m.episode_number,
         m.published, m.sort_order, m.playback_sources,
         count(*) over (
           partition by m.category, m.media_type, m.tmdb_id
         ) as episode_count,
         row_number() over (
           partition by m.category, m.media_type, m.tmdb_id
           order by m.season_number, m.episode_number, m.id
         ) as row_pos
  from public.movie_library as m
  where m.published = true
) as ranked
where row_pos = 1;

create or replace view public.movie_library_seasons
with (security_invoker = true)
as
select category, tmdb_id, season_number,
       count(*)::integer as episode_count,
       min(episode_number) as first_episode,
       max(episode_number) as last_episode
from public.movie_library
where published = true and media_type = 'tv'
group by category, tmdb_id, season_number;

revoke all on public.movie_library_catalog from public;
revoke all on public.movie_library_seasons from public;
grant select on public.movie_library_catalog to anon, authenticated;
grant select on public.movie_library_seasons to anon, authenticated;

comment on view public.movie_library_catalog is
'Public lightweight catalog, one item per film or TV series, SECURITY INVOKER honors underlying movie_library RLS.';
comment on view public.movie_library_seasons is
'Public TV season counts, no episode playback data, SECURITY INVOKER honors underlying movie_library RLS.';
