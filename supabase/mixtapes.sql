-- Crate: mixtapes, a sleeve of 2 to 5 songs.
-- Run once, after growth.sql: SQL Editor → New query → paste all of this → Run.
-- Each track is { title, artist, apple, spotify, art, line }. A mixtape row keeps its name in title,
-- "Mixtape · N songs" in artist and the first cover in art, so everything that reads records still works.

alter table public.records add column if not exists tracks jsonb check (
  tracks is null or (jsonb_typeof(tracks) = 'array' and jsonb_array_length(tracks) between 2 and 5 and pg_column_size(tracks) < 8000));
alter table public.saved add column if not exists tracks jsonb check (
  tracks is null or (jsonb_typeof(tracks) = 'array' and jsonb_array_length(tracks) between 2 and 5 and pg_column_size(tracks) < 8000));

-- Short links and preview images need the tracks too.
create or replace function public.record_card(rid text) returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', id, 'title', title, 'artist', artist, 'art', art, 'from', sender_name,
                           'note', note, 'spotify', spotify, 'apple', apple, 'tracks', tracks)
    from public.records where id = rid;
$$;
