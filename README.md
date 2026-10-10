# Unlecture

Unlecture helps IE students before exams turn confusing lecture slides into clear explainer videos so they finally get it.

Built with Next.js 16 (App Router), Tailwind CSS 4 and Supabase (Auth + Postgres with Row Level Security).

## Run it locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL and publishable key.
3. Create the tables: paste `supabase/migrations/0001_study_packs.sql` into Supabase → SQL Editor → Run.
4. In Supabase → Authentication → Sign In / Providers → Email, switch **Confirm email** off.
5. Install and start:

   ```bash
   npm install
   npm run dev
   ```

6. Open http://localhost:3000.

## Pages

| Route     | What it is                                      |
| --------- | ----------------------------------------------- |
| `/`       | Public landing page                             |
| `/signup` | Sign up with email + password, then go to `/app` |
| `/login`  | Log in with email + password, then go to `/app`  |
| `/app`    | Your study packs (logged-in users only)          |

## Project layout

- `proxy.ts` and `lib/supabase/proxy.ts`: refresh the session cookie and redirect logged-out users away from `/app`.
- `lib/supabase/server.ts`: Supabase client for server code.
- `app/actions/auth.ts`: sign up, log in, log out (server actions).
- `app/app/`: the study pack feature.
- `supabase/migrations/`: SQL for tables, grants and RLS policies.
