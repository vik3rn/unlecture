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
  chapters: [number, string][];
  recaps: string[];
  drills: GuideQuestion[];
  mcs: GuideQuestion[];
  works: GuideExercise[];
};

export type GuideContent = {
  exam: string | null;
  facts: string[];
  examDay: string[];
  notOnSheet: string[];
  credit: string;
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
    exam,
    facts: strs(c.facts, 12),
    examDay: strs(c.examDay, 20),
    notOnSheet: strs(c.notOnSheet, 60),
    credit: str(c.credit, 300),
    parts: Array.isArray(c.parts) ? c.parts.slice(0, 200).map(part).filter((p): p is GuidePart => p !== null) : [],
  };
}

// Stable key per question, shared by the quiz, the progress row and the stats.
export const questionKeys = (p: GuidePart) => [
  ...p.drills.map((q, i) => ({ q, key: `${p.n}-v${i}` })),
  ...p.mcs.map((q, i) => ({ q, key: `${p.n}-p${i}` })),
];
