-- Unlecture · step 3: exam guides (curated study guides) + each user's progress in them
-- Paste into Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to run more than once. Run 0001 first (0002 is not needed).
--
-- Guides are written only by the project owner (SQL Editor). Every logged-in user can read them.
-- The guide content itself is NOT in this repository: it is loaded with a separate seed file.

-- ─────────────────────────────────────────────────────────────
-- 1. Guides (read-only for users)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.guides (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  summary     text not null default '' check (char_length(summary) <= 500),
  content     jsonb not null,
  part_count  integer not null default 0 check (part_count between 0 and 200),
  exam_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.guides enable row level security;

-- Any logged-in user may read guides. Nobody can read them without logging in.
drop policy if exists "guides_select_logged_in" on public.guides;
create policy "guides_select_logged_in" on public.guides
  for select to authenticated
  using ((select auth.uid()) is not null);

-- No insert/update/delete policies or grants: users cannot change guides.
revoke all on table public.guides from anon;
revoke all on table public.guides from authenticated;
grant select on table public.guides to authenticated;
-- The free preview (/guides/[slug]) reads guides on the server with the secret key (role service_role).
-- With "Automatically expose new tables" OFF, service_role gets no table rights by default, so grant read only.
grant select on table public.guides to service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. Progress: quiz answers and "done" marks, one row per user and guide
-- ─────────────────────────────────────────────────────────────
create table if not exists public.guide_progress (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  guide_id    uuid not null references public.guides (id) on delete cascade,
  progress    jsonb not null default '{}'::jsonb check (octet_length(progress::text) <= 100000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, guide_id)
);

alter table public.guide_progress enable row level security;

drop policy if exists "guide_progress_select_own" on public.guide_progress;
create policy "guide_progress_select_own" on public.guide_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "guide_progress_insert_own" on public.guide_progress;
create policy "guide_progress_insert_own" on public.guide_progress
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "guide_progress_update_own" on public.guide_progress;
create policy "guide_progress_update_own" on public.guide_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "guide_progress_delete_own" on public.guide_progress;
create policy "guide_progress_delete_own" on public.guide_progress
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.guide_progress from anon;
grant select, insert, update, delete on table public.guide_progress to authenticated;
-- The owner-only admin page (/app/admin) reads all progress rows on the server with the secret key.
grant select on table public.guide_progress to service_role;
