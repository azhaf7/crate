-- Crate: short links with rich previews, reply tracking, and daily growth numbers.
-- Run once, after schema.sql and social.sql: SQL Editor → New query → paste all of this → Run.

-- ---------- Short links: /s/<id> ----------
-- The Vercel function (api/card.js) reads a record by its id to build the link preview and send the
-- browser on to the record page. Holding the id is the same as holding the full link, so this shows
-- exactly what the link would: song, cover, who it's from and the note. Never who it's to.
create or replace function public.record_card(rid text) returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', id, 'title', title, 'artist', artist, 'art', art, 'from', sender_name,
                           'note', note, 'spotify', spotify, 'apple', apple)
    from public.records where id = rid;
$$;
revoke all on function public.record_card(text) from public;
grant execute on function public.record_card(text) to anon, authenticated;

-- ---------- Replies: "Send one back" ----------
-- A record sent from a reply link remembers the record it answers, so replies can be counted.
alter table public.records add column if not exists reply_to text check (reply_to is null or reply_to ~ '^[A-Za-z0-9]{12}$');

create or replace function public.mark_reply(rid text, re text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if re !~ '^[A-Za-z0-9]{12}$' or rid = re then return false; end if;
  update public.records set reply_to = re where id = rid and sender = auth.uid() and reply_to is null;
  return found;
end $$;
revoke all on function public.mark_reply(text, text) from public;
grant execute on function public.mark_reply(text, text) to authenticated;

-- ---------- Growth numbers, per day ----------
-- Only you can read this (Table Editor or SQL Editor): the app's keys have no access to it.
--   select * from public.crate_daily order by day desc limit 30;
create or replace view public.crate_daily as
select date_trunc('day', created_at)::date                                   as day,
       count(*)                                                              as records_sent,
       count(distinct sender)                                                as senders,
       count(*) filter (where opened_at is not null)                         as opened,
       round(100.0 * count(*) filter (where opened_at is not null) / count(*), 1) as open_rate_pct,
       count(*) filter (where reaction is not null)                          as reacted,
       count(*) filter (where reply_to is not null)                          as replies
  from public.records
 group by 1;
revoke all on public.crate_daily from anon, authenticated;
