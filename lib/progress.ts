// The shape of guide_progress.progress and the strict check every save goes through (app/app/guides/actions.ts).
// No imports, so the same code runs in the server action and in plain Node tests. The client is never trusted:
// keys, values and sizes outside this shape are dropped. Rows saved before open questions and mock exams existed
// ({ done, quiz, exam? }) come out unchanged.

// The score of one submitted mock attempt, in exam points.
export type MockScore = { score: number; max: number; at: number };

// A student's latest attempt at one mock exam, plus the scores of every submitted attempt.
export type MockState = {
  id: string; // the mock's id in the guide (also the key in `mocks`)
  startedAt: number; // epoch ms; the countdown runs from here, so a reload continues the same attempt
  submittedAt: number | null; // null while the attempt runs
  answers: Record<string, string>; // "q0" → picked letters ("B") or the text of an open answer
  grades: Record<string, number>; // "q7" → self-grade of an open answer: 0, 0.5 or 1
  history: MockScore[]; // submitted attempts, oldest first; best and last are read from it
};

export type GuideProgress = {
  // part number → marked done
  done: Record<string, boolean>;
  // question key → the letters the user picked (formats with two or more correct options, like DAE)
  quiz: Record<string, string[]>;
  // the student's own exam for this course: local date and time in an IANA time zone
  exam?: { date: string; time: string; tz: string };
  // question key → the one letter picked, or "" when checked blank (formats with one correct option)
  pick?: Record<string, string>;
  // open question key ("3-o0") → the student's answer
  open?: Record<string, string>;
  // open question key → self-grade 0, 0.5 or 1 (share of the question's points)
  grade?: Record<string, number>;
  // mock id → the latest attempt and the attempt scores
  mocks?: Record<string, MockState>;
};

export const LIMITS = {
  keys: 600, // entries in done, quiz and pick
  openChars: 2000, // characters in one open answer (parts and mocks)
  opens: 300, // entries in open and in grade
  mocks: 20, // mock exams per guide
  mockAnswers: 150, // answers (and self-grades) per mock attempt
  history: 20, // scored attempts kept per mock
  bytes: 98_000, // the whole row (progressBytes); the table allows 100,000
} as const;

const KEY = /^[0-9a-z-]{1,24}$/i;
const LETTERS = new Set(["A", "B", "C", "D", "E", "F", "G", "H"]);
const MOCK_ID = /^[a-z0-9-]{1,40}$/;
const MOCK_KEY = /^q\d{1,3}$/;
const T_MIN = Date.UTC(2024, 0, 1);
const T_MAX = Date.UTC(2100, 0, 1);

function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const entries = (v: unknown, max: number) => (isObject(v) ? Object.entries(v).slice(0, max) : []);
const time = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= T_MIN && v <= T_MAX ? v : null);
const isGrade = (v: unknown): v is number => v === 0 || v === 0.5 || v === 1;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

// Free text the student typed: capped, and without what Postgres jsonb refuses (NUL, lone surrogates).
export function cleanText(v: string) {
  return v.slice(0, LIMITS.openChars).replace(/\u0000/g, "").toWellFormed();
}

function cleanMock(id: string, v: unknown): MockState | null {
  if (!isObject(v)) return null;
  const startedAt = time(v.startedAt);
  if (startedAt === null) return null;
  const sub = v.submittedAt == null ? null : time(v.submittedAt);
  const submittedAt = sub !== null && sub >= startedAt ? sub : null;
  const answers: Record<string, string> = {};
  for (const [k, a] of entries(v.answers, LIMITS.mockAnswers)) {
    if (!MOCK_KEY.test(k) || typeof a !== "string") continue;
    const t = cleanText(a);
    if (t.trim()) answers[k] = t;
  }
  const grades: Record<string, number> = {};
  for (const [k, g] of entries(v.grades, LIMITS.mockAnswers)) {
    if (MOCK_KEY.test(k) && isGrade(g)) grades[k] = g;
  }
  const history: MockScore[] = [];
  for (const h of Array.isArray(v.history) ? v.history.slice(-LIMITS.history) : []) {
    if (!isObject(h)) continue;
    const { score, max } = h;
    const at = time(h.at);
    // A score never passes the maximum either way (the worst is every question wrong at a 100 % penalty), so a
    // hand-made row cannot skew the averages on /app/admin.
    if (
      typeof max === "number" && Number.isFinite(max) && max > 0 && max <= 10_000 &&
      typeof score === "number" && Number.isFinite(score) && Math.abs(score) <= max && at !== null
    ) {
      history.push({ score: round3(score), max: round3(max), at });
    }
  }
  return { id, startedAt, submittedAt, answers, grades, history };
}

// Accepts only the shape above. Returns null when the input is not a progress object at all.
export function cleanProgress(input: unknown): GuideProgress | null {
  if (!input || typeof input !== "object") return null;
  const { done, quiz, exam, pick, open, grade, mocks } = input as Record<string, unknown>;
  const out: GuideProgress = { done: {}, quiz: {} };
  if (done && typeof done === "object") {
    for (const [k, v] of Object.entries(done).slice(0, LIMITS.keys)) {
      if (KEY.test(k) && v === true) out.done[k] = true;
    }
  }
  if (quiz && typeof quiz === "object") {
    for (const [k, v] of Object.entries(quiz).slice(0, LIMITS.keys)) {
      if (!KEY.test(k) || !Array.isArray(v) || v.length < 2 || v.length > 7) continue;
      const picks = v.filter((x): x is string => typeof x === "string" && LETTERS.has(x));
      if (picks.length === v.length && new Set(picks).size === picks.length) out.quiz[k] = picks;
    }
  }
  if (exam && typeof exam === "object") {
    const { date, time: at, tz } = exam as { date?: unknown; time?: unknown; tz?: unknown };
    if (
      typeof date === "string" && /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) &&
      typeof at === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(at) &&
      typeof tz === "string" && tz.length <= 64 && /^[A-Za-z_+\-/0-9]+$/.test(tz) && validZone(tz)
    ) {
      out.exam = { date, time: at, tz };
    }
  }

  const picks: Record<string, string> = {};
  for (const [k, v] of entries(pick, LIMITS.keys)) {
    if (KEY.test(k) && typeof v === "string" && (v === "" || LETTERS.has(v))) picks[k] = v;
  }
  if (Object.keys(picks).length) out.pick = picks;

  const opens: Record<string, string> = {};
  for (const [k, v] of entries(open, LIMITS.opens)) {
    if (!KEY.test(k) || typeof v !== "string") continue;
    const t = cleanText(v);
    if (t.trim()) opens[k] = t;
  }
  if (Object.keys(opens).length) out.open = opens;

  const grades: Record<string, number> = {};
  for (const [k, v] of entries(grade, LIMITS.opens)) {
    if (KEY.test(k) && isGrade(v)) grades[k] = v;
  }
  if (Object.keys(grades).length) out.grade = grades;

  const ms: Record<string, MockState> = {};
  for (const [k, v] of entries(mocks, LIMITS.mocks)) {
    const m = MOCK_ID.test(k) ? cleanMock(k, v) : null;
    if (m) ms[k] = m;
  }
  if (Object.keys(ms).length) out.mocks = ms;
  return out;
}

// The same progress, whatever the order of the keys (jsonb sorts them, the browser keeps insertion order) and
// whatever empty parts one side has: both go through cleanProgress first.
export function sameProgress(a: unknown, b: unknown) {
  const canon = (v: unknown) =>
    JSON.stringify(cleanProgress(v), (_, x) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).sort(([k1], [k2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : 0)))
        : x,
    );
  return canon(a) === canon(b);
}

// Size of the row as the table's check measures it, octet_length(progress::text): the JSON in UTF-8, plus the space
// jsonb's text form puts after every ":" and "," between values.
export function progressBytes(p: GuideProgress) {
  const json = JSON.stringify(p);
  let separators = 0;
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === ":" || ch === ",") separators++;
  }
  return new TextEncoder().encode(json).length + separators;
}
