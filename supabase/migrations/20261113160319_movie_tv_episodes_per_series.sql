-- Already applied to the existing Supabase yqxyy database on 2026-11-13.
-- Keep historical film and TV IDs unchanged. A multi-episode TV series shares
-- its TMDB number but stores an independent row and source list per episode.
alter table public.movie_library
  drop constraint if exists movie_library_tmdb_unique;
alter table public.movie_library
  drop constraint if exists movie_library_id_format;
alter table public.movie_library
  add constraint movie_library_id_format
  check (
    id ~ '^tmdb-(movie|tv)-[0-9]+$'
    or (media_type = 'tv' and id ~ '^tmdb-tv-[0-9]+-s[0-9]+-e[0-9]+$')
  );
alter table public.movie_library
  add constraint movie_library_episode_unique
  unique (media_type, tmdb_id, season_number, episode_number);
comment on constraint movie_library_episode_unique on public.movie_library is
  'Preserves existing film IDs and historical TV rows; permits multiple TV episodes per TMDB ID with distinct season and episode. Admin RLS remains unchanged.';
