# Unlecture

Unlecture exam guides take IE students through a course step by step before the exam: short videos that play on the page, key points, exam-style quizzes (pick two of six) and paper exercises. Quiz answers and progress are saved to the student's account.

Built with Next.js 16 (App Router), Tailwind CSS 4 and Supabase (Auth + Postgres with Row Level Security).

## Run it locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL and publishable key.
3. Create the tables: paste `supabase/migrations/0001_study_packs.sql`, then `supabase/migrations/0003_guides.sql`, then `supabase/migrations/0004_guide_time.sql` (study time) into Supabase → SQL Editor → Run.
   Guide content is not stored in this repository. It is loaded into the `guides` table with a separate seed SQL file.
4. In Supabase → Authentication → Sign In / Providers → Email, switch **Confirm email** off.
5. Install and start:

   ```bash
   npm install
   npm run dev
   ```

6. Open http://localhost:3000.

## Server-only secret

The free preview reads guides on the server with `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → Secret keys). Set it in Vercel's environment variables and in your local env file. It is never sent to the browser and must never be committed.

## Pages

| Route     | What it is                                      |
| --------- | ----------------------------------------------- |
| `/`       | Public landing page                             |
| `/signup` | Sign up with email + password, then go to `/app` |
| `/login`  | Log in with email + password, then go to `/app`  |
| `/app`    | Exam guides and your study list (logged-in users only) |
| `/guides/[slug]` and `/guides/[slug]/[part]` | Free preview without an account: overview with locked parts, and the open part (nothing is saved) |
| `/app/guides/[slug]` | Course overview: all parts with your status and where to continue |
| `/app/guides/[slug]/[part]` | One part: video, key points, quiz, open questions, paper exercises, previous/next |
| `/app/guides/[slug]/mock/[id]` | A timed mock exam: rules, countdown, autosave, submit, result with review and topic breakdown |

## Project layout

- `proxy.ts` and `lib/supabase/proxy.ts`: refresh the session cookie and redirect logged-out users away from `/app`.
- `lib/supabase/server.ts`: Supabase client for server code.
- `app/app/guides/[slug]/study-timer.tsx`, `lib/study-tracker.ts`, `app/api/guide-time/route.ts` and `lib/guide-time.ts`: active study time per day and part (`guide_time` table, written only through the `add_guide_time` database function), shown on the owner-only `/app/admin`.
- `app/actions/auth.ts`: sign up, log in, log out (server actions).
- `app/app/`: the guide list and the study list (`study_packs` table).
- `app/app/guides/`: the guide page and the server action that saves progress.
- `lib/guides.ts`: the shape of a guide and a strict parser that only lets a short list of HTML tags through. A guide may set its exam `format` (options, correct answers, points, penalty, blank allowed, label), open questions per part (`opens`) and timed `mocks`; without `format` it keeps the DAE rules (pick two of six, no penalty).
- `lib/scoring.ts`: exam scoring for single-answer quizzes and mock exams (penalties, blanks, self-graded open answers, topics).
- `lib/progress.ts`: the shape of a student's saved progress and the strict check every save goes through (size limits included).
- `lib/progress-sync.ts` and `app/api/guide-progress/route.ts`: saving progress (debounced, retried, at once when the tab is hidden) and reading the student's own row again when a tab comes back into view, so an old tab does not overwrite newer work.
- `supabase/migrations/`: SQL for tables, grants and RLS policies.
