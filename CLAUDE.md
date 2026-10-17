## Grading contract — EdTech Challenge (never remove or break this)

An automated bot grades this app on its public Vercel URL, acting like a stranger.

### Pages
- `/` public landing page (no login needed): what the app does, who it is for, and one button to sign up.
- `/signup` sign-up with email + password. `/login` login with email + password.
- `/app` the main feature, only for logged-in users.
- After sign-up and after login, send the user to `/app`.
- No email confirmation, no CAPTCHA, no "Google only" login, no mandatory onboarding before `/app`.

### data-testid attributes (exact names, do not translate)
- Sign-up form: `signup-email`, `signup-password`, `signup-submit`
- Login form: `login-email`, `login-password`, `login-submit`
- `logout`: the logout button, visible on every page of a logged-in user
- On `/app`:
  - `core-input`: a TEXT field of the main feature (type="text" or a textarea, e.g. the title or description, never a number or date picker). The bot types a short text like "QA-7F3K2A grading bot test"
  - `core-submit`: the button that saves it
  - `core-item`: EVERY saved item in the list, showing the text typed in `core-input`
- Typing only in `core-input` and clicking `core-submit` must save a new item. Any other field needs a valid default value.

### Data and security
- Use Supabase Auth (email + password) and save all data in Supabase tables, never only in the browser (no localStorage for user data).
- Row Level Security ON for every table, with policies based on `auth.uid()`. Nobody can read anything without logging in.
- Only the Supabase URL and the publishable (anon) key may reach the browser. Never put the secret/service_role key or any AI API key in the frontend or in GitHub.
- Keep keys in `.env.local` (listed in `.gitignore`) and in Vercel environment variables.

---

## Product: Unlecture

**One-liner:** Unlecture helps IE BBA 3rd-year students study each course step by step, with every note kept in one summary.

- **Who:** IE BBA 3rd-year students with an exam in the next two weeks (the landing page says so in its first line).
- **Exam guides:** curated by the project owner and stored in the `guides` table (read-only for users; content is loaded with a seed SQL file that is NOT in this repo). A guide has a course overview (`/app/guides/[slug]`) and one page per part (`/app/guides/[slug]/[part]`); progress lives in the guide layout (`progress.tsx`). One guide = parts with an embedded video (unlisted, `youtube-nocookie`, loaded only when the student presses play), chapters, key points, exam-style quizzes (pick two of six) and paper exercises.
- **Exam formats:** a guide may set `content.format` (e.g. 4 options, 1 correct, 0.5 points, −25 % for a wrong answer, blanks allowed). Then quizzes are single-answer and scored in exam points, parts can have open questions (`opens`: line limit, model answer, rubric, self-grade) and the guide can have timed mock exams (`mocks`, route `/app/guides/[slug]/mock/[id]`, logged-in only; locked in the free preview). Without `format` a guide keeps the DAE rules (pick two of six). Parser: `lib/guides.ts`; scoring: `lib/scoring.ts`.
- **Progress:** quiz answers and "done" marks are saved per user in `guide_progress` (RLS: own rows only) through a server action that validates the shape (`lib/progress.ts`: also single answers, open answers up to 2,000 characters, self-grades and mock attempts; rows over ~98 KB are refused with a clear message because the table allows 100,000 bytes). Saving, retrying a failed save and re-reading the saved row when a tab comes back into view (so a second tab or device cannot overwrite a submitted mock with an old copy) are in `lib/progress-sync.ts`; the read goes through `GET /api/guide-progress?guide=<id>` (own row only, never cached).
- **Main feature (core): notes for the exam.** `/app` is "My notes" (`app/app/page.tsx`, `app/app/notes-overview.tsx`): the user types a note or a question in `core-input` (a textarea) and clicks `core-submit`; it is saved at once to the `notes` table (`supabase/migrations/0005_notes.sql`, RLS own rows only) and shown as a `core-item`. Every note on `/app` is a `core-item`, grouped by course and part, newest group first, with a course switch, filters (kind) and search. Every note belongs to a course (no "General"): the course defaults to the chosen course, else the guide studied last, else the first guide; the part defaults to "Whole course". Notes whose course is no longer listed show under "Other". A "Continue where you left off" link goes to the next part of the guide studied last. "Show summary" opens `/app/notes/summary` (questions to clear up, key points saved, own notes part by part; `?guide=<id>` for one course; no AI) and "Export PDF" opens `/app/notes/print` (same order, Unlecture letterhead, each course on a new page, print window). Saving never calls an AI API. Server actions: `app/app/notes-actions.ts`; shape check and helpers (summarize, reading order): `lib/notes.ts`; loader for summary and PDF: `lib/notes-data.ts`.
- **Navigation (logged in):** the site header has the tabs "My guides" (`/app/guides`, the guide cards, `app/app/guides/page.tsx`) and "My notes" (`/app`), `app/components/main-nav.tsx`. After sign-up and login the user lands on `/app` (contract).
- **Notes inside a guide part:** the notes panel (`notes-context.tsx`, `notes-panel.tsx`) shows this part's notes, or with the "Whole course" switch every note of the course (this part first, then the other parts with links to them), and sits beside the video and the quiz from 1180 px and is a bottom sheet behind a "Notes" button below that. "+ Note at m:ss" under the video and the N key pause the video and open the composer at that moment; notes show as marks on a strip under the video. Each quiz and open question has "+ Note on this question" (the panel quotes it and offers "I don't understand this one" in one click); a question note suggests the last answered question. Key points have "+ Save to notes". Study mode puts the part and the panel in fullscreen (not on iPhone, which only allows video fullscreen). `/app/notes/print` is the PDF export (print window). `?t=<seconds>` on a part page starts the video at a note's moment. No notes in the free preview.
- **Data:** private. Each user sees only their own notes and progress. Guides are visible to every logged-in user. The old study list (`study_packs`) is no longer shown; the table stays for the admin's guide requests.
- **Study time:** the logged-in guide layout (`study-timer.tsx`, `lib/study-tracker.ts`) measures active time (tab visible and an interaction in the last 2 minutes or a video playing) and posts it to `/api/guide-time`, which calls the database function `add_guide_time` (security definer, user from `auth.uid()`, 0–120 s per call). Table `guide_time` stores only user, guide, day, part (−1 = overview/other pages) and seconds; users can read their own rows, nobody writes it directly. The owner sees it on `/app/admin`. Nothing is tracked in the free preview.
- **Admin (owner only, `ADMIN_EMAILS`):** `app/app/admin/layout.tsx` draws the sidebar (no data); every page checks the owner itself before loading anything, and `error.tsx` shows what failed. `/app/admin` is the overview (five numbers for 7 or 30 days against the period before, active students per day, needs attention, sign-up → mock funnel, weekly cohorts, guide cards; maths in `lib/admin-metrics.ts`, data in `lib/admin-data.ts`). `/app/admin/students` lists every account and the guide requests; `/app/admin/guides` has study time, parts, hardest questions, mocks and students per guide. Students show by email (the owner asked for that; the pages are confidential). Activity comparisons stay off until study days were tracked for the whole previous period (tracking began 15 Oct 2026).
- **Guide HTML:** guide text may hold a little HTML (formulas, tables). `lib/guides.ts` escapes every tag outside a short allowlist and every attribute except `class`; only a plain 11-character YouTube id reaches the embed URL.
- **Free preview without an account:** `/guides/[slug]` (public, noindex) shows only the guide's preview parts (`content.preview`, default the first part); every other part is a locked card. Nothing is saved there. The server reads the guide with the secret key (`lib/supabase/admin.ts`, `SUPABASE_SECRET_KEY`, server-only, in Vercel env vars, never in the browser or on GitHub) and strips locked parts with `previewContent` before anything is sent. RLS is unchanged: anon still cannot read any table. Logged-in users are redirected to `/app/guides/[slug]`.
- **Later (parked):** AI-generated explainer videos from uploaded slides. Not part of the app for now.

### Supabase project settings (already chosen)
- Region Europe. "Enable Data API" ON. "Automatically expose new tables" OFF. "Enable automatic RLS" ON.
- Because new tables are not exposed automatically, every table's SQL must include explicit grants for the `authenticated` role (for example `grant select, insert, update, delete on table public.<table> to authenticated;`) as well as RLS policies based on `auth.uid()`. Do not grant anything to `anon`.

### Build order
1. The contract skeleton (landing page, auth, `/app` with the core feature, RLS), deployed and tested like the bot. The core feature is now notes (it was the study list).
2. Exam guides: `guides` + `guide_progress` tables, guide list on `/app`, guide page with embedded videos, quizzes and saved progress.
3. Landing page polish after watching real users. AI video generation only if it comes back (then: server routes only, per-user quota, explicit click).
