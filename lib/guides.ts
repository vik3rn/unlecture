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

// An open question: the student writes an answer within a line limit, then compares it with the model answer and
// grades it themselves (0, half or full points).
export type GuideOpen = {
  src: "video" | "paper";
  stem: string;
  ctx: string;
  lines: number; // the line limit on the exam; 0 = no limit given
  model: string;
  points: number;
  rubric: string[]; // short points the grader looks for
};

// The exam's multiple-choice rules. A guide without `format` gets the DAE rules (6 options, 2 correct, no penalty).
export type GuideFormat = {
  options: number; // options per question, 2–8
  correct: number; // correct options per question, 1 to options − 1
  points: number; // points for a correct answer
  wrongPenalty: number; // fraction of `points` lost for a wrong answer (0.25 → −0.125 when points is 0.5)
  blank: boolean; // a question may be left blank (0 points)
  label: string; // the rules as students see them, plain text; "" = the DAE default copy
};

// A full timed mock exam. Questions follow the guide's format; open questions are self-graded after submitting.
export type MockMcq = {
  kind: "mcq";
  stem: string;
  ctx: string;
  opts: string[];
  correct: string[];
  notes: string[];
  expl: string;
  topic: string; // plain text
};
export type MockOpen = {
  kind: "open";
  stem: string;
  ctx: string;
  lines: number;
  model: string;
  rubric: string[];
  points: number;
  topic: string; // plain text
};
export type MockQuestion = MockMcq | MockOpen;

export type GuideMock = {
  id: string;
  title: string;
  minutes: number;
  intro: string;
  video: string | null; // slug of the part with the walkthrough
  pdf: string | null; // https link or site path to a paper version
  questions: MockQuestion[];
  size: { mcq: number; open: number; points: number };
  // Set by previewContent: listed in the free preview, but without its questions.
  locked?: boolean;
};

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
  opens: GuideOpen[];
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
  format: GuideFormat;
  parts: GuidePart[];
  mocks: GuideMock[];
};

export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

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

const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
const real = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
const list = <T,>(x: unknown, f: (y: unknown) => T | null, max = 200) =>
  Array.isArray(x) ? x.slice(0, max).map(f).filter((y): y is T => y !== null) : [];
// Plain text (no HTML at all) for labels and topics. Always render it as text (React escapes it), never with <Html>.
const text = (v: unknown, max: number) =>
  typeof v === "string" ? plain(v.slice(0, max * 2)).replace(/\s+/g, " ").trim().slice(0, max) : "";

// The DAE rules, used when a guide has no `format`.
export const DEFAULT_FORMAT: GuideFormat = { options: 6, correct: 2, points: 1, wrongPenalty: 0, blank: false, label: "" };

const trim3 = (x: number) => String(Math.round(x * 1000) / 1000);

// Accepts the whole format or none of it: options and correct must make sense, or the guide keeps the DAE rules.
function parseFormat(v: unknown): GuideFormat {
  if (!v || typeof v !== "object") return DEFAULT_FORMAT;
  const f = v as Record<string, unknown>;
  const options = int(f.options, 2, 8);
  const correct = options === null ? null : int(f.correct, 1, options - 1);
  if (options === null || correct === null) return DEFAULT_FORMAT;
  const points = real(f.points, 0.001, 100) ?? 1;
  const wrongPenalty = real(f.wrongPenalty, 0, 1) ?? 0;
  const blank = typeof f.blank === "boolean" ? f.blank : wrongPenalty > 0;
  const rule = wrongPenalty > 0 ? `\u2212${trim3(wrongPenalty * 100)} % for a wrong answer` : "no penalty";
  return {
    options,
    correct,
    points,
    wrongPenalty,
    blank,
    label: text(f.label, 120) || `${options} options \u00b7 ${correct} correct \u00b7 ${rule}`,
  };
}

// The parts of a multiple-choice question that parts and mocks share. It must match the format exactly:
// `options` options and `correct` different letters among them.
function choice(q: Record<string, unknown>, f: GuideFormat) {
  // Exactly `options` options: a question written for another format is dropped, never cut to fit.
  if (!Array.isArray(q.opts) || q.opts.length !== f.options) return null;
  const allowed: readonly string[] = LETTERS.slice(0, f.options);
  const opts = strs(q.opts, f.options);
  const correct = Array.isArray(q.correct)
    ? q.correct.filter((x): x is string => typeof x === "string" && allowed.includes(x))
    : [];
  if (opts.length !== f.options || correct.length !== f.correct || new Set(correct).size !== correct.length) return null;
  return { stem: str(q.stem), ctx: str(q.ctx), opts, correct, notes: strs(q.notes, f.options), expl: str(q.expl) };
}

function question(v: unknown, f: GuideFormat): GuideQuestion | null {
  if (!v || typeof v !== "object") return null;
  const q = v as Record<string, unknown>;
  const c = choice(q, f);
  if (!c) return null;
  return { src: q.src === "video" ? "video" : "paper", ...c, at: num(q.at) };
}

// What open questions in parts and mocks share. A question without a stem is dropped.
function openCore(q: Record<string, unknown>) {
  const stem = str(q.stem);
  if (!stem.trim()) return null;
  return {
    stem,
    ctx: str(q.ctx),
    lines: int(q.lines, 1, 200) ?? 0,
    model: str(q.model),
    rubric: Array.isArray(q.rubric) ? q.rubric.slice(0, 12).map((r) => str(r, 400)).filter((r) => r.trim()) : [],
    points: real(q.points, 0.001, 100) ?? 1,
  };
}

function openQuestion(v: unknown): GuideOpen | null {
  if (!v || typeof v !== "object") return null;
  const q = v as Record<string, unknown>;
  const c = openCore(q);
  return c ? { src: q.src === "video" ? "video" : "paper", ...c } : null;
}

const SLUG = /^[a-z0-9-]{1,80}$/;

function mockQuestion(v: unknown, f: GuideFormat): MockQuestion | null {
  if (!v || typeof v !== "object") return null;
  const q = v as Record<string, unknown>;
  const topic = text(q.topic, 80);
  if (q.kind === "mcq") {
    const c = choice(q, f);
    return c ? { kind: "mcq", ...c, topic } : null;
  }
  if (q.kind === "open") {
    const c = openCore(q);
    return c ? { kind: "open", ...c, topic } : null;
  }
  return null;
}

// Only an https link or a plain path on this site may become a link to a paper version.
function pdfLink(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  if (/^\/[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(v) && !v.includes("..") && !v.includes("//")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

function mock(v: unknown, f: GuideFormat): GuideMock | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (typeof m.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(m.id)) return null;
  const questions = list(m.questions, (q) => mockQuestion(q, f), 150);
  if (questions.length === 0) return null;
  let mcq = 0;
  let points = 0;
  for (const q of questions) {
    if (q.kind === "mcq") mcq++;
    points += q.kind === "mcq" ? f.points : q.points;
  }
  return {
    id: m.id,
    title: str(m.title, 200) || "Mock exam",
    minutes: int(m.minutes, 1, 300) ?? 60,
    intro: str(m.intro),
    video: typeof m.video === "string" && SLUG.test(m.video) ? m.video : null,
    pdf: pdfLink(m.pdf),
    questions,
    size: { mcq, open: questions.length - mcq, points: Math.round(points * 1000) / 1000 },
  };
}

function part(v: unknown, f: GuideFormat): GuidePart | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const n = num(p.n);
  if (n === null) return null;
  return {
    n,
    slug: typeof p.slug === "string" && SLUG.test(p.slug) ? p.slug : `part-${n}`,
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
    drills: list(p.drills, (q) => question(q, f)),
    mcs: list(p.mcs, (q) => question(q, f)),
    works: list(p.works, (w) => {
      if (!w || typeof w !== "object") return null;
      const x = w as Record<string, unknown>;
      return { q: str(x.q), a: str(x.a), tag: str(x.tag, 100) };
    }),
    opens: list(p.opens, openQuestion, 40),
  };
}

export function parseGuideContent(raw: unknown): GuideContent {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const exam = typeof c.exam === "string" && !Number.isNaN(Date.parse(c.exam)) ? c.exam : null;
  const format = parseFormat(c.format);
  const ids = new Set<string>();
  return {
    brand: str(c.brand, 80),
    exam,
    facts: strs(c.facts, 12),
    examDay: strs(c.examDay, 20),
    notOnSheet: strs(c.notOnSheet, 60),
    credit: str(c.credit, 300),
    preview: Array.isArray(c.preview) ? c.preview.filter((n): n is number => num(n) !== null).slice(0, 20) : [],
    format,
    parts: list(c.parts, (p) => part(p, format)),
    // A repeated mock id is dropped: the id is the key of the student's attempt.
    mocks: list(c.mocks, (m) => mock(m, format), 20).filter((m) => !ids.has(m.id) && !!ids.add(m.id)),
  };
}

// Stable key per question, shared by the quiz, the progress row and the stats.
export const questionKeys = (p: GuidePart) => [
  ...p.drills.map((q, i) => ({ q, key: `${p.n}-v${i}` })),
  ...p.mcs.map((q, i) => ({ q, key: `${p.n}-p${i}` })),
];

// Stable key per open question of a part (progress.open and progress.grade).
export const openKeys = (p: GuidePart) => p.opens.map((q, i) => ({ q, key: `${p.n}-o${i}` }));

// The free preview: only the preview parts keep their content (first part if none is set); every other part
// keeps just its title, unit and length and is marked locked. Mock exams keep only their title, length and size.
// Runs on the server, so locked content never reaches the browser.
export function previewContent(c: GuideContent): GuideContent {
  const open = new Set(c.preview.length ? c.preview : c.parts.slice(0, 1).map((p) => p.n));
  return {
    ...c,
    examDay: [],
    notOnSheet: [],
    parts: c.parts.map((p) =>
      open.has(p.n)
        ? p
        : { ...p, yt: null, file: null, chapters: [], recaps: [], drills: [], mcs: [], works: [], opens: [], locked: true },
    ),
    mocks: c.mocks.map((m) => ({ ...m, intro: "", video: null, pdf: null, questions: [], locked: true })),
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
  opens: string[]; // keys of the open questions
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
    opens: openKeys(p).map(({ key }) => key),
  }));

// What the course overview shows per mock exam (no questions).
export type MockSummary = {
  id: string;
  title: string;
  minutes: number;
  mcq: number;
  open: number;
  points: number;
  locked: boolean;
};

export const summarizeMocks = (c: GuideContent): MockSummary[] =>
  c.mocks.map((m) => ({ id: m.id, title: m.title, minutes: m.minutes, ...m.size, locked: !!m.locked }));

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
