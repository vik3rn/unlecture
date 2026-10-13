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

**One-liner:** Unlecture exam guides take IE students through a course step by step before the exam, so they know what to expect on exam day.

- **Who:** IE University students with an exam in the next two weeks.
- **Exam guides:** curated by the project owner and stored in the `guides` table (read-only for users; content is loaded with a seed SQL file that is NOT in this repo). One guide = parts with an embedded YouTube video (unlisted, `youtube-nocookie`, loaded only when the student presses play), chapters, key points, exam-style quizzes (pick two of six) and paper exercises.
- **Progress:** quiz answers and "done" marks are saved per user in `guide_progress` (RLS: own rows only) through a server action that validates the shape.
- **Main feature (core):** on `/app` the user types a course or topic they need a guide for in `core-input` and clicks `core-submit`. It is saved at once to their study list (`study_packs` table) and shown as a `core-item`. Saving never calls an AI API.
- **Data:** private. Each user sees only their own study list and progress. Guides are visible to every logged-in user.
- **Guide HTML:** guide text may hold a little HTML (formulas, tables). `lib/guides.ts` escapes every tag outside a short allowlist and every attribute except `class`; only a plain 11-character YouTube id reaches the embed URL.
- **Later (parked):** AI-generated explainer videos from uploaded slides. Not part of the app for now.

### Supabase project settings (already chosen)
- Region Europe. "Enable Data API" ON. "Automatically expose new tables" OFF. "Enable automatic RLS" ON.
- Because new tables are not exposed automatically, every table's SQL must include explicit grants for the `authenticated` role (for example `grant select, insert, update, delete on table public.<table> to authenticated;`) as well as RLS policies based on `auth.uid()`. Do not grant anything to `anon`.

### Build order
1. The contract skeleton (landing page, auth, `/app` with the study list, RLS), deployed and tested like the bot.
2. Exam guides: `guides` + `guide_progress` tables, guide list on `/app`, guide page with embedded videos, quizzes and saved progress.
3. Landing page polish after watching real users. AI video generation only if it comes back (then: server routes only, per-user quota, explicit click).
