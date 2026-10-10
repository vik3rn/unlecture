-- Unlecture · step 1: study packs
-- Paste into Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to run more than once.

create table if not exists public.study_packs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  created_at  timestamptz not null default now()
);

create index if not exists study_packs_user_id_created_at_idx
  on public.study_packs (user_id, created_at desc);

-- Row Level Security: each user only ever sees and changes their own packs.
alter table public.study_packs enable row level security;

drop policy if exists "study_packs_select_own" on public.study_packs;
create policy "study_packs_select_own" on public.study_packs
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "study_packs_insert_own" on public.study_packs;
create policy "study_packs_insert_own" on public.study_packs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "study_packs_update_own" on public.study_packs;
create policy "study_packs_update_own" on public.study_packs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "study_packs_delete_own" on public.study_packs;
create policy "study_packs_delete_own" on public.study_packs
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- New tables are not exposed automatically in this project, so grant access
-- explicitly to logged-in users only. Nothing is granted to anon.
revoke all on table public.study_packs from anon;
grant select, insert, update, delete on table public.study_packs to authenticated;
