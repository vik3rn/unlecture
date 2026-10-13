// Exam guides: the shape of guides.content and a strict parser for it.
// Guide text may hold a little HTML (formulas, small tables). Everything outside a short allowlist is escaped,
// so even a broken guide row can never run script in a student's browser.

export type GuideQuestion = {
  src: "video" | "paper";
  stem: string;
  ctx: string;
  opts: string[];
  correct: string[];
  notes: string[];
  expl: string;
  at: number | null;
};

export type GuideExercise = { q: string; a: string; tag: string };

export type GuidePart = {
  n: number;
  slug: string;
  title: string;
  unit: string;
  dur: string;
  yt: string | null;
  // Object key of the MP4 in the private R2 bucket; played through a short-lived link from /api/video.
  file: string | null;
  chapters: [number, string][];
  recaps: string[];
  drills: GuideQuestion[];
  mcs: GuideQuestion[];
  works: GuideExercise[];
  // Set by previewContent: the part is shown as a locked card in the free preview.
  locked?: boolean;
};

export type GuideContent = {
  brand: string;
  exam: string | null;
  facts: string[];
  examDay: string[];
  notOnSheet: string[];
  credit: string;
  // Part numbers that are open in the free preview without an account.
  preview: number[];
  parts: GuidePart[];
};

export const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

const TAGS = new Set(["b", "i", "em", "strong", "sub", "sup", "br", "span", "code", "table", "thead", "tbody", "tr", "th", "td"]);

export function safeHtml(input: string): string {
  return input.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>|<|>/g, (match, close, tag, attrs) => {
    if (tag === undefined) return match === "<" ? "&lt;" : "&gt;";
    const name = String(tag).toLowerCase();
    if (!TAGS.has(name)) return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (close) return `</${name}>`;
    const cls = /\bclass\s*=\s*(['"])([a-z0-9 -]{1,40})\1/i.exec(String(attrs));
    return cls ? `<${name} class="${cls[2]}">` : `<${name}>`;
  });
}

const str = (v: unknown, max = 20000) => (typeof v === "string" ? safeHtml(v.slice(0, max)) : "");
const strs = (v: unknown, max = 200) => (Array.isArray(v) ? v.slice(0, max).map((x) => str(x)) : []);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

function question(v: unknown): GuideQuestion | null {
  if (!v || typeof v !== "object") return null;
  const q = v as Record<string, unknown>;
  const opts = strs(q.opts, 6);
  const correct = Array.isArray(q.correct)
    ? q.correct.filter((x): x is string => typeof x === "string" && (LETTERS as readonly string[]).includes(x))
    : [];
  if (opts.length !== 6 || correct.length !== 2) return null;
  return {
    src: q.src === "video" ? "video" : "paper",
    stem: str(q.stem),
    ctx: str(q.ctx),
    opts,
    correct,
    notes: strs(q.notes, 6),
    expl: str(q.expl),
    at: num(q.at),
  };
}

function part(v: unknown): GuidePart | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const n = num(p.n);
  if (n === null) return null;
  const list = <T,>(x: unknown, f: (y: unknown) => T | null) =>
    Array.isArray(x) ? x.slice(0, 200).map(f).filter((y): y is T => y !== null) : [];
  return {
    n,
    slug: typeof p.slug === "string" && /^[a-z0-9-]{1,80}$/.test(p.slug) ? p.slug : `part-${n}`,
    title: str(p.title, 300),
    unit: str(p.unit, 100),
    dur: str(p.dur, 20),
    // Only a plain YouTube video id ever reaches the embed URL.
    yt: typeof p.yt === "string" && /^[A-Za-z0-9_-]{11}$/.test(p.yt) ? p.yt : null,
    file:
      typeof p.file === "string" && /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,200}\.mp4$/.test(p.file) && !p.file.includes("..")
        ? p.file
        : null,
    chapters: list(p.chapters, (c) =>
      Array.isArray(c) && num(c[0]) !== null ? ([num(c[0]) as number, str(c[1], 200)] as [number, string]) : null,
    ),
    recaps: strs(p.recaps),
    drills: list(p.drills, question),
    mcs: list(p.mcs, question),
    works: list(p.works, (w) => {
      if (!w || typeof w !== "object") return null;
      const x = w as Record<string, unknown>;
      return { q: str(x.q), a: str(x.a), tag: str(x.tag, 100) };
    }),
  };
}

export function parseGuideContent(raw: unknown): GuideContent {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const exam = typeof c.exam === "string" && !Number.isNaN(Date.parse(c.exam)) ? c.exam : null;
  return {
    brand: str(c.brand, 80),
    exam,
    facts: strs(c.facts, 12),
    examDay: strs(c.examDay, 20),
    notOnSheet: strs(c.notOnSheet, 60),
    credit: str(c.credit, 300),
    preview: Array.isArray(c.preview) ? c.preview.filter((n): n is number => num(n) !== null).slice(0, 20) : [],
    parts: Array.isArray(c.parts) ? c.parts.slice(0, 200).map(part).filter((p): p is GuidePart => p !== null) : [],
  };
}

// Stable key per question, shared by the quiz, the progress row and the stats.
export const questionKeys = (p: GuidePart) => [
  ...p.drills.map((q, i) => ({ q, key: `${p.n}-v${i}` })),
  ...p.mcs.map((q, i) => ({ q, key: `${p.n}-p${i}` })),
];

// The free preview: only the preview parts keep their content (first part if none is set); every other part
// keeps just its title, unit and length and is marked locked. Runs on the server, so locked content never
// reaches the browser.
export function previewContent(c: GuideContent): GuideContent {
  const open = new Set(c.preview.length ? c.preview : c.parts.slice(0, 1).map((p) => p.n));
  return {
    ...c,
    examDay: [],
    notOnSheet: [],
    parts: c.parts.map((p) =>
      open.has(p.n)
        ? p
        : { ...p, yt: null, file: null, chapters: [], recaps: [], drills: [], mcs: [], works: [], locked: true },
    ),
  };
}

// Text for places that cannot hold HTML (menus, aria labels, the page title).
export const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

export const mmss = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// What the course overview needs per part (no question text): titles, sizes and the keys/answers for scoring.
export type PartSummary = {
  n: number;
  title: string;
  unit: string;
  dur: string;
  chapters: number;
  works: number;
  hasVideo: boolean;
  locked: boolean;
  qs: { key: string; correct: string[] }[];
};

export const summarizeParts = (c: GuideContent): PartSummary[] =>
  c.parts.map((p) => ({
    n: p.n,
    title: p.title,
    unit: p.unit,
    dur: p.dur,
    chapters: Math.max(0, p.chapters.length - 1),
    works: p.works.length,
    hasVideo: !!(p.file || p.yt),
    locked: !!p.locked,
    qs: questionKeys(p).map(({ q, key }) => ({ key, correct: q.correct })),
  }));

// A student's exam: a local date and time in an IANA time zone ("2026-10-16", "14:30", "Europe/Madrid").
export type ExamSetting = { date: string; time: string; tz: string };

// The exact moment of a local date/time in a time zone, without a date library: guess UTC, measure the zone's
// offset at that instant with Intl, correct, and measure once more for daylight-saving edges.
export function examInstant({ date, time, tz }: ExamSetting): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(t)
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t;
  };
  const first = asUtc - offset(asUtc);
  return asUtc - offset(first);
}

// "Fri 16 Oct, 14:30 CEST" in the exam's own time zone.
export const formatExam = (e: ExamSetting) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: e.tz,
    timeZoneName: "short",
  }).format(examInstant(e));
