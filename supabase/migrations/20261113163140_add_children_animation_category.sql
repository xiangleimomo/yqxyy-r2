-- Applied to the current YQXYY Supabase database on 2026-11-13.
-- Preserve existing categories and row-level security.
alter table public.movie_library drop constraint if exists movie_library_category_check;
alter table public.movie_library add constraint movie_library_category_check
  check (category in ('animated','documentary','animation','kids'));
comment on constraint movie_library_category_check on public.movie_library is
  'animated = feature films, documentary = documentaries, animation = animated stories, kids = children television animation.';
