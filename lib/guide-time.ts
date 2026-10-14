// Time spent studying a guide: the pure pieces, shared by the tracker (browser), the route handler that saves it
// and the admin page. Only the day, the part and a number of seconds are ever stored (supabase/migrations/0004).

export const IDLE_MS = 120_000; // counts as studying for 2 minutes after the last pointer, key, scroll or touch
export const MAX_STEP_MS = 30_000; // longer gaps between samples mean the page was frozen or the computer slept
export const MAX_SECONDS = 120; // most seconds one request may add (the database clamps to the same)
export const MAX_PART = 200;
export const OTHER_PART = -1; // the course overview, mock exams and any other page of the guide

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,60}$/;

// The [part] segment of /app/guides/[slug]/[part] → part number; anything else counts as OTHER_PART.
export function partFromSegment(segment: string | null | undefined): number {
  if (!segment || !/^\d{1,3}$/.test(segment)) return OTHER_PART;
  const n = Number(segment);
  return n <= MAX_PART ? n : OTHER_PART;
}

export type GuideTimeInput = { guide: { id: string } | { slug: string }; part: number; seconds: number };

// Body of POST /api/guide-time: {guideId | slug, part, seconds}. The client is never trusted.
export function parseGuideTimeBody(body: unknown): GuideTimeInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { guideId, slug, part, seconds } = body as Record<string, unknown>;
  let guide: GuideTimeInput["guide"];
  if (guideId !== undefined) {
    if (typeof guideId !== "string" || !UUID.test(guideId)) return null;
    guide = { id: guideId.toLowerCase() };
  } else if (typeof slug === "string" && SLUG.test(slug)) {
    guide = { slug };
  } else {
    return null;
  }
  if (typeof part !== "number" || !Number.isInteger(part) || part < OTHER_PART || part > MAX_PART) return null;
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) return null;
  return { guide, part, seconds };
}

// Splits a number of whole seconds into request-sized chunks (1–120 each).
export function chunkSeconds(total: number): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.floor(total));
  while (left > 0) {
    const c = Math.min(left, MAX_SECONDS);
    out.push(c);
    left -= c;
  }
  return out;
}

// Active study time from a monotonic clock (performance.now()). Time counts while the page is visible AND either
// the student interacted within IDLE_MS or a video is playing. The caller samples it on every state change and
// on a timer (well under MAX_STEP_MS apart while visible); every sample adds the time since the previous one,
// judged by the state that held during that stretch.
export class ActiveClock {
  #since: number;
  #lastInput: number;
  #visible: boolean;
  #playing = false;
  #ms = 0;

  constructor(now: number, visible: boolean) {
    this.#since = now;
    this.#visible = visible;
    // Opening the page is an interaction.
    this.#lastInput = visible ? now : Number.NEGATIVE_INFINITY;
  }

  #advance(now: number) {
    if (now <= this.#since) return;
    if (this.#visible) {
      const start = Math.max(this.#since, now - MAX_STEP_MS);
      const end = this.#playing ? now : Math.min(now, this.#lastInput + IDLE_MS);
      if (end > start) this.#ms += end - start;
    }
    this.#since = now;
  }

  input(now: number) {
    this.#advance(now);
    this.#lastInput = Math.max(this.#lastInput, now);
  }

  setPlaying(now: number, playing: boolean) {
    this.#advance(now);
    this.#playing = playing;
  }

  setVisible(now: number, visible: boolean) {
    this.#advance(now);
    // Coming back to the tab is an interaction too.
    if (visible && !this.#visible) this.#lastInput = Math.max(this.#lastInput, now);
    this.#visible = visible;
  }

  // Whole seconds counted so far; the remainder under a second stays for the next take.
  take(now: number): number {
    this.#advance(now);
    const s = Math.floor(this.#ms / 1000);
    this.#ms -= s * 1000;
    return s;
  }
}

// "3 h 25 min", "25 min", "< 1 min", "–" for nothing.
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "–";
  const minutes = Math.round(seconds / 60);
  if (minutes === 0) return "< 1 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Today's date (YYYY-MM-DD) in the time zone the database uses for `day` (see add_guide_time).
export const STUDY_TZ = "Europe/Madrid";
export function dayIn(date: Date, timeZone = STUDY_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// The first day of the last `days` days, today included: dayStart("2026-10-14", 7) → "2026-10-08".
export function dayStart(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - (days - 1))).toISOString().slice(0, 10);
}

export type TimeRow = { user_id: string; guide_id: string; day: string; part: number; seconds: number };
export type UserTime = { total: number; recent: number; last: string };
export type GuideTime = {
  total: number;
  recent: number;
  users: Map<string, UserTime>;
  parts: Map<number, { total: number; users: Set<string> }>;
};

// Sums the rows per guide, per student and per part. `since` is the first day that counts as recent.
export function summarizeTime(rows: TimeRow[], since: string) {
  const guides = new Map<string, GuideTime>();
  let recent = 0;
  for (const r of rows) {
    const s = Number(r.seconds) || 0;
    if (s <= 0) continue;
    const isRecent = r.day >= since;
    if (isRecent) recent += s;
    let g = guides.get(r.guide_id);
    if (!g) guides.set(r.guide_id, (g = { total: 0, recent: 0, users: new Map(), parts: new Map() }));
    g.total += s;
    if (isRecent) g.recent += s;
    const u = g.users.get(r.user_id) ?? { total: 0, recent: 0, last: "" };
    u.total += s;
    if (isRecent) u.recent += s;
    if (r.day > u.last) u.last = r.day;
    g.users.set(r.user_id, u);
    const p = g.parts.get(r.part) ?? { total: 0, users: new Set<string>() };
    p.total += s;
    p.users.add(r.user_id);
    g.parts.set(r.part, p);
  }
  return { recent, guides };
}
