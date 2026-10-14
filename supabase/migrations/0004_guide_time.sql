-- Unlecture · step 4: time spent studying (seconds per user, guide, day and part)
-- Paste into Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to run more than once. Run 0003 first.
--
-- Data minimisation: only the day, the part (−1 = course overview, mock exams and other pages) and a number of
-- seconds. No URLs, no event times, no device data.
-- Students can read their own rows. Nobody writes the table directly: the app adds time only through
-- public.add_guide_time(), which takes the user from the login (auth.uid()), never from the request.

-- ─────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────
create table if not exists public.guide_time (
  user_id     uuid not null references auth.users (id) on delete cascade,
  guide_id    uuid not null references public.guides (id) on delete cascade,
  day         date not null,
  part        integer not null check (part between -1 and 200),
  seconds     integer not null default 0 check (seconds between 0 and 86400),
  updated_at  timestamptz not null default now(),
  primary key (user_id, guide_id, day, part)
);

-- The primary key covers lookups by user; this one covers deleting a guide (on delete cascade).
create index if not exists guide_time_guide_id_idx on public.guide_time (guide_id);

alter table public.guide_time enable row level security;

-- Each student may read only their own rows.
drop policy if exists "guide_time_select_own" on public.guide_time;
create policy "guide_time_select_own" on public.guide_time
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies or grants: writes go only through add_guide_time() below.
revoke all on table public.guide_time from anon;
revoke all on table public.guide_time from authenticated;
grant select on table public.guide_time to authenticated;
-- The owner-only admin page (/app/admin) reads all rows on the server with the secret key (role service_role).
-- With "Automatically expose new tables" OFF, service_role gets no table rights by default, so grant read only.
grant select on table public.guide_time to service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. Adding time: the only way in
-- ─────────────────────────────────────────────────────────────
-- Adds p_seconds (clamped to 0–120 per call) to today's row (Europe/Madrid) for the calling user, guide and part.
-- A single day/part row never goes above 86,400 seconds (24 hours).
-- security definer: runs with the owner's rights so it can write past RLS, which is why it never takes a user id
-- as input, uses an empty search_path and fully qualified names.
create or replace function public.add_guide_time(p_guide uuid, p_part integer, p_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid    := (select auth.uid());
  v_seconds integer := least(greatest(coalesce(p_seconds, 0), 0), 120);
begin
  if v_user is null then
    raise exception 'Not logged in.' using errcode = '28000';
  end if;
  if p_guide is null or p_part is null or p_part < -1 or p_part > 200 then
    raise exception 'Bad guide or part.' using errcode = '22023';
  end if;
  if v_seconds = 0 then
    return;
  end if;

  insert into public.guide_time as t (user_id, guide_id, day, part, seconds, updated_at)
  values (v_user, p_guide, (pg_catalog.now() at time zone 'Europe/Madrid')::date, p_part, v_seconds, pg_catalog.now())
  on conflict (user_id, guide_id, day, part) do update
    set seconds    = least(t.seconds + excluded.seconds, 86400),
        updated_at = excluded.updated_at;
end;
$$;

-- Functions are executable by everyone by default: allow logged-in users only.
revoke execute on function public.add_guide_time(uuid, integer, integer) from public;
revoke execute on function public.add_guide_time(uuid, integer, integer) from anon;
grant execute on function public.add_guide_time(uuid, integer, integer) to authenticated;
