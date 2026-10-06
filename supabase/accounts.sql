-- Crate: optional email sign-in, so your records follow you to every device.
-- Run once, after schema.sql: SQL Editor → New query → paste all of this → Run.

-- Records friends sent you that you saved ("Save in Crate"), kept per account.
create table if not exists public.saved (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  song_key text not null check (char_length(song_key) between 1 and 300),
  title text not null check (char_length(title) between 1 and 200),
  artist text not null default '' check (char_length(artist) <= 200),
  from_name text check (char_length(from_name) <= 40),
  note text check (char_length(note) <= 80),
  art text check (art is null or art ~ '^https://([a-z0-9-]+\.)*(scdn\.co|mzstatic\.com|spotifycdn\.com)/'),
  spotify text check (spotify is null or spotify ~ '^[A-Za-z0-9]{22}$'),
  apple text check (apple is null or apple ~ '^[0-9]{4,15}$'),
  saved_at timestamptz not null default now(),
  primary key (owner, song_key)
);

alter table public.saved enable row level security;

-- Only signed-in (email) accounts keep saved records here; anonymous browsers keep them on the device.
drop policy if exists "your saved records" on public.saved;
create policy "your saved records" on public.saved for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

revoke all on public.saved from anon, authenticated;
grant select, insert, delete on public.saved to authenticated;

-- At most 300 saves an hour per account.
create or replace function public.limit_saved() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.saved where owner = new.owner and saved_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many records saved in the last hour. Try again later.';
  end if;
  return new;
end $$;
drop trigger if exists saved_rate_limit on public.saved;
create trigger saved_rate_limit before insert on public.saved for each row execute function public.limit_saved();

-- Moving records sent before signing in into the account.
-- The anonymous browser asks for a one-time claim code; after signing in with email it hands the code
-- back and its records move over. Only the browser that held the anonymous identity can get a code.
create table if not exists public.claims (
  code uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.claims enable row level security;   -- no policies: only the functions below touch it
revoke all on public.claims from anon, authenticated;

create or replace function public.start_claim() returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null or not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then return null; end if;
  delete from public.claims where owner = auth.uid() or created_at < now() - interval '1 day';
  insert into public.claims (owner) values (auth.uid()) returning code into c;
  return c;
end $$;

create or replace function public.finish_claim(c uuid) returns integer language plpgsql security definer set search_path = public as $$
declare old uuid; n integer;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then return 0; end if;
  select owner into old from public.claims where code = c and created_at > now() - interval '1 hour';
  if old is null or old = auth.uid() then return 0; end if;
  update public.records set sender = auth.uid() where sender = old;
  get diagnostics n = row_count;
  delete from public.claims where code = c;
  -- The anonymous identity has nothing left; remove it.
  delete from auth.users where id = old and is_anonymous;
  return n;
end $$;

revoke all on function public.start_claim() from public;
revoke all on function public.finish_claim(uuid) from public;
grant execute on function public.start_claim() to authenticated;
grant execute on function public.finish_claim(uuid) to authenticated;
