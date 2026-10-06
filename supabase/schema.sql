-- Crate: records sent as links, and when friends open them.
-- Run once in the Supabase project: SQL Editor → New query → paste all of this → Run.
-- Anonymous sign-ins must be on: Authentication → Sign In / Providers → "Allow anonymous sign-ins".
-- Nobody makes an account: each browser gets an anonymous identity the first time it sends a record.

-- This project used to hold Vinyl Player's friends and shared records; the Mac app no longer uses them.
drop table if exists public.shares cascade;
drop table if exists public.friendships cascade;
drop table if exists public.profiles cascade;
drop function if exists public.limit_shares() cascade;

-- One row per record sent. The id is random and goes in the link, so only people with the link know it.
create table if not exists public.records (
  id text primary key check (id ~ '^[A-Za-z0-9]{12}$'),
  sender uuid not null default auth.uid() references auth.users on delete cascade,
  sender_name text check (char_length(sender_name) <= 40),
  to_name text check (char_length(to_name) <= 40),
  title text not null check (char_length(title) between 1 and 200),
  artist text not null default '' check (char_length(artist) <= 200),
  note text check (char_length(note) <= 80),
  art text check (art is null or art ~ '^https://([a-z0-9-]+\.)*(scdn\.co|mzstatic\.com|spotifycdn\.com)/'),
  spotify text check (spotify is null or spotify ~ '^[A-Za-z0-9]{22}$'),
  apple text check (apple is null or apple ~ '^[0-9]{4,15}$'),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  opens integer not null default 0,
  -- When the sender last looked at this record's opens (drives the "new opens" badge).
  seen_at timestamptz
);
create index if not exists records_sender_idx on public.records (sender, created_at desc);

alter table public.records enable row level security;

drop policy if exists "send as yourself" on public.records;
create policy "send as yourself" on public.records for insert to authenticated with check (sender = auth.uid());

drop policy if exists "see what you sent" on public.records;
create policy "see what you sent" on public.records for select to authenticated using (sender = auth.uid());

drop policy if exists "mark your opens seen" on public.records;
create policy "mark your opens seen" on public.records for update to authenticated
  using (sender = auth.uid()) with check (sender = auth.uid());

drop policy if exists "delete what you sent" on public.records;
create policy "delete what you sent" on public.records for delete to authenticated using (sender = auth.uid());

-- Senders may only change seen_at; everything else about a record is fixed once it's sent.
revoke update on public.records from authenticated, anon;
grant update (seen_at) on public.records to authenticated;
grant select, insert, delete on public.records to authenticated;

-- At most 60 records an hour per sender.
create or replace function public.limit_records() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.records where sender = new.sender and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many records sent in the last hour. Try again later.';
  end if;
  return new;
end $$;
drop trigger if exists records_rate_limit on public.records;
create trigger records_rate_limit before insert on public.records for each row execute function public.limit_records();

-- Opening a record from its link. Anyone with the link may call this; it counts the open (not when
-- the sender opens their own record) and tells the sender nothing else about who opened it.
create or replace function public.open_record(rid text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.records
     set opens = opens + 1, opened_at = coalesce(opened_at, now())
   where id = rid and sender is distinct from auth.uid();
  return found;
end $$;
revoke all on function public.open_record(text) from public;
grant execute on function public.open_record(text) to anon, authenticated;
