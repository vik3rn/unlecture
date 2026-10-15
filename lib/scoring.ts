// Exam scoring for guides with a format (lib/guides.ts GuideFormat): single-answer quizzes in the parts and full
// mock exams. Pure functions with type-only imports, so plain Node tests can run them.
import type { GuideFormat, GuideMock } from "./guides";
import type { MockScore } from "./progress";

export const GRADES = [0, 0.5, 1] as const;
export const gradeLabel = (g: number) => (g === 1 ? "Full" : g === 0.5 ? "\u00bd" : "0");

// Rounded to a thousandth, so 0.1 + 0.2 shows as 0.3.
export const round3 = (x: number) => Math.round(x * 1000) / 1000;

// Points as students read them: "0.5", "−0.125", "0"; with `signed`, "+0.5".
export function fmtPoints(x: number, signed = false) {
  const r = round3(x);
  if (r === 0) return "0";
  const abs = String(Math.abs(r));
  return r < 0 ? `−${abs}` : signed ? `+${abs}` : abs;
}

// "+0.5 right · −0.125 wrong · 0 blank" (no wrong part without a penalty).
export function scoringRule(f: GuideFormat) {
  const parts = [`${fmtPoints(f.points, true)} right`];
  if (f.wrongPenalty > 0) parts.push(`${fmtPoints(-f.points * f.wrongPenalty)} wrong`);
  else parts.push("0 wrong");
  if (f.blank) parts.push("0 blank");
  return parts.join(" · ");
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const word = (n: number) => WORDS[n] ?? String(n);

// "pick two", "pick one": how many options to mark.
export const pickText = (f: GuideFormat) => `pick ${word(f.correct)}`;
// "pick two of six".
export const pickOfText = (f: GuideFormat) => `${pickText(f)} of ${word(f.options)}`;
// The rule shown next to a quiz: the guide's own label, or the DAE copy ("pick two").
export const quizRule = (f: GuideFormat) => f.label || pickText(f);

export type ChoiceStatus = "right" | "wrong" | "partial" | "blank";

// The letters in an answer: "BE" → ["B", "E"]; at most `correct` count, the rest is ignored.
const lettersOf = (f: GuideFormat, answer: string | null | undefined) =>
  answer ? [...new Set(answer.split(""))].slice(0, f.correct) : [];

// Points for one multiple-choice answer. Each picked option is worth points / correct: a right pick adds it, a
// wrong pick takes away wrongPenalty of it, and a blank scores 0. With one correct option: +points right,
// −points × wrongPenalty wrong, 0 blank.
export function choicePoints(f: GuideFormat, correct: string[], answer: string | null | undefined) {
  const per = f.points / f.correct;
  let pts = 0;
  for (const x of lettersOf(f, answer)) pts += correct.includes(x) ? per : -per * f.wrongPenalty;
  return round3(pts);
}

export function choiceStatus(f: GuideFormat, correct: string[], answer: string | null | undefined): ChoiceStatus {
  const picks = lettersOf(f, answer);
  if (picks.length === 0) return "blank";
  const right = picks.filter((x) => correct.includes(x)).length;
  if (right === correct.length && picks.length === correct.length) return "right";
  return right === 0 ? "wrong" : "partial";
}

export type Tally = { right: number; wrong: number; blank: number; answered: number; points: number; max: number };

// Running score of single-answer quiz questions (progress.pick): only checked questions count.
export function tallyPicks(
  f: GuideFormat,
  items: { key: string; correct: string[] }[],
  picks: Record<string, string> | undefined,
): Tally {
  const t: Tally = { right: 0, wrong: 0, blank: 0, answered: 0, points: 0, max: 0 };
  for (const { key, correct } of items) {
    const a = picks?.[key];
    if (a === undefined) continue;
    const s = choiceStatus(f, correct, a);
    if (s === "blank") t.blank++;
    else if (s === "right") t.right++;
    else t.wrong++;
    t.answered++;
    t.points += choicePoints(f, correct, a);
    t.max += f.points;
  }
  t.points = round3(t.points);
  t.max = round3(t.max);
  return t;
}

// Words in an answer, and the soft word limit for a line limit (about 13 handwritten words per line).
export const WORDS_PER_LINE = 13;
export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// ── Mock exams ─────────────────────────────────────────────────────────────────────────────────────────────

export const mockKey = (i: number) => `q${i}`;
export const mockDeadline = (startedAt: number, minutes: number) => startedAt + minutes * 60_000;

// "59:07", or "1:02:03" for an hour or more.
export function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// The time left in steps for screen readers: every ten minutes, then 10, 5 and 1 minute ("at most N minutes").
// The mock timer announces a step only when the clock passes into it, never every second.
export function timeStep(left: number) {
  const min = Math.ceil(left / 60_000);
  if (min <= 1) return 1;
  if (min <= 5) return 5;
  if (min <= 10) return 10;
  return Math.ceil(min / 10) * 10;
}

export type QuestionResult = {
  i: number;
  key: string;
  kind: "mcq" | "open";
  // mcq: right / wrong / partial / blank; open: graded / ungraded (no self-grade yet) / blank (nothing written)
  status: ChoiceStatus | "graded" | "ungraded";
  points: number;
  max: number;
  topic: string;
};

export type MockResult = {
  total: number;
  max: number;
  mcq: { right: number; wrong: number; partial: number; blank: number; points: number; max: number };
  open: { graded: number; ungraded: number; points: number; max: number };
  topics: { topic: string; points: number; max: number; count: number }[];
  questions: QuestionResult[];
};

// Scores an attempt: multiple choice under the format rules, open questions by self-grade × points (0 until
// graded). An open question left empty scores 0 and needs no grade.
export function scoreMock(
  m: GuideMock,
  f: GuideFormat,
  a: { answers: Record<string, string>; grades: Record<string, number> },
): MockResult {
  const r: MockResult = {
    total: 0,
    max: 0,
    mcq: { right: 0, wrong: 0, partial: 0, blank: 0, points: 0, max: 0 },
    open: { graded: 0, ungraded: 0, points: 0, max: 0 },
    topics: [],
    questions: [],
  };
  const topics = new Map<string, MockResult["topics"][number]>();
  m.questions.forEach((q, i) => {
    const key = mockKey(i);
    const answer = a.answers[key];
    let res: QuestionResult;
    if (q.kind === "mcq") {
      const status = choiceStatus(f, q.correct, answer);
      res = { i, key, kind: "mcq", status, points: choicePoints(f, q.correct, answer), max: f.points, topic: q.topic };
      r.mcq[status]++;
      r.mcq.points += res.points;
      r.mcq.max += res.max;
    } else {
      const g = a.grades[key];
      const written = !!answer?.trim();
      const graded = written && (g === 0 || g === 0.5 || g === 1);
      const status = !written ? "blank" : graded ? "graded" : "ungraded";
      res = { i, key, kind: "open", status, points: graded ? round3((g as number) * q.points) : 0, max: q.points, topic: q.topic };
      if (status === "graded") r.open.graded++;
      if (status === "ungraded") r.open.ungraded++;
      r.open.points += res.points;
      r.open.max += res.max;
    }
    r.questions.push(res);
    const name = q.topic || "Other";
    const t = topics.get(name) ?? { topic: name, points: 0, max: 0, count: 0 };
    t.points = round3(t.points + res.points);
    t.max = round3(t.max + res.max);
    t.count++;
    topics.set(name, t);
  });
  r.mcq.points = round3(r.mcq.points);
  r.mcq.max = round3(r.mcq.max);
  r.open.points = round3(r.open.points);
  r.open.max = round3(r.open.max);
  r.total = round3(r.mcq.points + r.open.points);
  r.max = round3(r.mcq.max + r.open.max);
  r.topics = [...topics.values()];
  return r;
}

// Best attempt: the highest share of the maximum (the later one on a tie).
export function bestScore(history: MockScore[]): MockScore | null {
  let best: MockScore | null = null;
  for (const h of history) if (!best || h.score / h.max >= best.score / best.max) best = h;
  return best;
}

// Puts an attempt's score into the history: replaces the entry of the same attempt (`at` = its submit time, when
// a self-grade changes) or adds it. Over the cap, the oldest entry that is not the best goes.
export function recordScore(history: MockScore[], entry: MockScore, cap = 20): MockScore[] {
  const next = history.some((h) => h.at === entry.at)
    ? history.map((h) => (h.at === entry.at ? entry : h))
    : [...history, entry];
  while (next.length > cap) {
    const best = bestScore(next);
    next.splice(next.findIndex((h) => h !== best), 1);
  }
  return next;
}

export const pct = (score: number, max: number) => (max > 0 ? Math.round((100 * score) / max) : 0);

// "24 %", "−4 %" (a typographic minus, like the points).
export const fmtPct = (score: number, max: number) => {
  const p = pct(score, max);
  return `${p < 0 ? "\u2212" : ""}${Math.abs(p)} %`;
};

// "1 point", "0.5 points", "−0.125 points".
export const pointsWord = (x: number) => `${fmtPoints(x)} ${round3(x) === 1 ? "point" : "points"}`;
