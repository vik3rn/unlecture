-- Unlecture · notes for the exam (the main feature on /app). A student saves short notes and questions while
-- studying a guide: at a moment in the video, about a quiz question, a key point, or in general.
-- Paste into Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to run more than once.

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  kind        text not null default 'note' check (kind in ('note', 'question')),
  source      text not null default 'general' check (source in ('general', 'video', 'quiz', 'keypoint')),
  guide_id    uuid references public.guides (id) on delete set null,
  part        integer check (part between 0 and 200),
  video_at    integer check (video_at between 0 and 36000),
  ref         text check (char_length(ref) <= 40),
  created_at  timestamptz not null default now()
);

create index if not exists notes_user_id_created_at_idx
  on public.notes (user_id, created_at desc);
create index if not exists notes_user_id_guide_part_idx
  on public.notes (user_id, guide_id, part);

-- Row Level Security: each user only ever sees and changes their own notes.
alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own" on public.notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own" on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- New tables are not exposed automatically in this project, so grant access
-- explicitly to logged-in users only. Nothing is granted to anon.
revoke all on table public.notes from anon;
grant select, insert, update, delete on table public.notes to authenticated;
