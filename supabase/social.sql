-- Crate: reactions on records, and a per-person allowance for Ask Crate (Claude).
-- Run once, after schema.sql: SQL Editor → New query → paste all of this → Run.

-- ---------- Reactions ----------
-- A friend who opened a record can react to it once (and change their mind). The sender sees it on
-- Records next to Opened. Stored as a word, shown as an emoji by the app.
alter table public.records add column if not exists reaction text
  check (reaction is null or reaction in ('love', 'fire', 'cry', 'dance', 'mind'));
alter table public.records add column if not exists reacted_at timestamptz;

-- Anyone with the link may react; like open_record, it never reveals who reacted.
create or replace function public.react_record(rid text, r text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if r not in ('love', 'fire', 'cry', 'dance', 'mind') then return false; end if;
  update public.records
     set reaction = r, reacted_at = now(), opened_at = coalesce(opened_at, now())
   where id = rid and sender is distinct from auth.uid();
  return found;
end $$;
revoke all on function public.react_record(text, text) from public;
grant execute on function public.react_record(text, text) to anon, authenticated;

-- ---------- Ask Crate: at most 20 Claude calls an hour per person ----------
-- The crate-ai Edge Function calls use_ai() with the person's own session before asking Claude.
create table if not exists public.ai_calls (
  caller uuid not null references auth.users on delete cascade,
  at timestamptz not null default now()
);
create index if not exists ai_calls_idx on public.ai_calls (caller, at desc);
alter table public.ai_calls enable row level security;   -- no policies: only use_ai() touches it
revoke all on public.ai_calls from anon, authenticated;

create or replace function public.use_ai() returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if (select count(*) from public.ai_calls where caller = auth.uid() and at > now() - interval '1 hour') >= 20 then
    return false;
  end if;
  delete from public.ai_calls where caller = auth.uid() and at < now() - interval '1 day';
  insert into public.ai_calls (caller) values (auth.uid());
  return true;
end $$;
revoke all on function public.use_ai() from public;
grant execute on function public.use_ai() to authenticated;
