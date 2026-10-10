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

**One-liner:** Unlecture helps IE students before exams turn confusing lecture slides into clear explainer videos so they finally get it.

- **Who:** IE University students with an exam in the next two weeks who don't understand their lecture slides.
- **Data:** private. Each user sees only their own study packs.
- **Main feature (core):** on `/app` the user types what they want to understand (for example "OLS regression") in `core-input` and clicks `core-submit`. A study pack is saved at once and shown as a `core-item`. Saving never calls an AI API.
- **Video generation** starts only when the user clicks "Make video" inside a study pack. Inputs: uploaded PDF, slides or images (Supabase Storage, private bucket with RLS), pasted text, or just the topic.
- **Flow:** two modes. "Quick" goes straight to the video. "Let me steer" shows the outline or script first, the user can edit or approve it, then the scenes are made. The user picks the length: short 3–5 min, medium 8–12, deep 15–25.
- **Video = live in the browser, not MP4.** The AI returns a scene plan as JSON, using a fixed set of scene types (title, bullet build, diagram/SVG, chart, timeline, compare, formula, figure from the upload, quiz stop). A player plays the scenes on one clock, in sync with the narration.
- **Interactive:** clickable quiz stops (the video pauses and the user answers to get an explanation), flashcards made after each video and stored in Supabase with spaced repetition, "ask about this scene" (one short AI answer), and "redo this scene" (only that scene is regenerated).
- **Languages:** the UI is in English. The video can be in any language the user chooses.
- **Voice:** start with the browser's `speechSynthesis`. Later, Azure or Google neural TTS through a server route (free tier).

### Supabase project settings (already chosen)
- Region Europe. "Enable Data API" ON. "Automatically expose new tables" OFF. "Enable automatic RLS" ON.
- Because new tables are not exposed automatically, every table's SQL must include explicit grants for the `authenticated` role (for example `grant select, insert, update, delete on table public.<table> to authenticated;`) as well as RLS policies based on `auth.uid()`. Do not grant anything to `anon`.

### Cost and AI rules
- Model: Claude Sonnet 5.5 (`claude-sonnet-5-5`) through the official `@anthropic-ai/sdk`, only in server route handlers. The key is `ANTHROPIC_API_KEY` (never `NEXT_PUBLIC_`).
- Every AI call is triggered by an explicit user click, checked against a per-user quota stored in Supabase (for example 5 videos per day and 30 questions per day) and logged with token usage. The same rules apply to every account, including the grading bot's.
- Long generations stream or are split into steps (outline → script → scenes), so no single Vercel function call runs into the time limit.

### Build order
1. The contract skeleton (landing page, auth, `/app` with study packs, RLS), deployed and tested like the bot.
2. Upload and "Make video" (outline → scenes) and the player with the browser voice.
3. Quiz stops, flashcards, "ask about this scene", "redo this scene", languages, neural voice.
4. Landing page polish after watching real users.
