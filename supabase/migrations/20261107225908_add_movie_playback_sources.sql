-- Additive change: existing catalogue rows and RLS policies are preserved.
create or replace function public.valid_movie_playback_sources(sources jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when pg_catalog.jsonb_typeof(sources) <> 'array' then false
  when pg_catalog.jsonb_array_length(sources) > 21 then false
  else not exists (
    select 1 from pg_catalog.jsonb_array_elements(sources) with ordinality as entries(item, n)
    where pg_catalog.jsonb_typeof(item) <> 'object'
       or coalesce(item->>'kind', '') not in ('auto', 'direct', 'embed')
       or pg_catalog.jsonb_typeof(item->'label') is distinct from 'string'
       or pg_catalog.length(coalesce(item->>'label','')) not between 1 and 80
       or pg_catalog.jsonb_typeof(item->'url') is distinct from 'string'
       or pg_catalog.length(coalesce(item->>'url','')) not between 10 and 4096
       or coalesce(item->>'url','') !~ '^https://[^/@[:space:]]+/'
       or coalesce(item->>'url','') ~ '[[:space:][:cntrl:]]'
       or (item->>'kind' in ('auto','direct') and coalesce(item->>'url','') !~* '\.(m3u8|mp4)([?#].*)?$')
       or (item->>'kind' = 'auto' and (n <> 1 or coalesce(item->>'url','') !~ '^https://api\.obj2\.top/hls/(movie/[0-9]+|tv/[0-9]+/[0-9]+/[0-9]+)/master\.m3u8$'))
  ) end;
$$;

alter table public.movie_library
  add column if not exists playback_sources jsonb not null default '[]'::jsonb;

alter table public.movie_library
  add constraint movie_library_playback_sources_valid
  check (public.valid_movie_playback_sources(playback_sources));

comment on column public.movie_library.playback_sources is
  'Ordered playback sources saved by existing site administrators: auto, direct or embed. Existing movie_library RLS applies.';
