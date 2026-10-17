// The numbers on the admin overview (app/app/admin/page.tsx), computed from rows the page already loads: accounts,
// guide_progress, guide_time and study_packs. Pure functions with no I/O, so they can be checked with sample rows.
// Days are Madrid calendar days ("YYYY-MM-DD"), the same days guide_time uses.

import type { TimeRow } from "./guide-time";
import type { MockState } from "./progress";

export type AdminUser = { id: string; created_at: string; last_sign_in_at?: string | null };
export type AdminProgress = {
  done?: Record<string, boolean>;
  quiz?: Record<string, string[]>;
  pick?: Record<string, string>;
  exam?: { date?: string } | null;
  mocks?: Record<string, MockState>;
};
export type AdminProgressRow = { user_id: string; guide_id: string; progress: AdminProgress; updated_at: string | null };
// Only what the overview needs from a guide: its parts and, per question, the progress key and the correct options.
export type AdminGuide = {
  id: string;
  slug: string;
  title: string;
  mark: string;
  single: boolean; // one correct option: answers live in progress.pick, otherwise in progress.quiz
  parts: { n: number; qs: { key: string; stem: string; correct: string[] }[] }[];
};
export type AdminPack = { title: string };

export type OverviewInput = {
  today: string;
  range: number; // days in the period: 7 or 30
  users: AdminUser[];
  rows: AdminProgressRow[];
  time: TimeRow[];
  guides: AdminGuide[];
  packs: AdminPack[];
  toDay: (iso: string) => string; // an ISO timestamp → its Madrid day
};

export type Attention = { tone: "critical" | "warning" | "info"; title: string; detail: string; href: string };

// ---------- day arithmetic on "YYYY-MM-DD" ----------
const toUtc = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86_400_000);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
// Monday of the week the day falls in.
export const weekStart = (d: string) => addDays(d, -((new Date(toUtc(d)).getUTCDay() + 6) % 7));
const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const doneCount = (p: AdminProgress) => Object.values(p.done ?? {}).filter(Boolean).length;
const hasMock = (p: AdminProgress) => Object.values(p.mocks ?? {}).some((m) => Array.isArray(m?.history) && m.history.length > 0);

// A student's answers per question key as letter lists, whatever the guide's format.
export function answersOf(p: AdminProgress, single: boolean): Record<string, string[]> {
  if (!single) return p.quiz ?? {};
  return Object.fromEntries(Object.entries(p.pick ?? {}).map(([k, v]) => [k, v ? [v] : []]));
}
const isFull = (a: string[] | undefined, correct: string[]) =>
  Array.isArray(a) && a.length === correct.length && a.every((x) => correct.includes(x));

export function computeOverview(input: OverviewInput) {
  const { today, range, users, rows, time, guides, packs, toDay } = input;
  const from = addDays(today, -(range - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(range - 1));
  const guideById = new Map(guides.map((g) => [g.id, g]));

  // Activity days per student: every day with study time, plus the day progress was last saved.
  const days = new Map<string, Set<string>>();
  const mark = (user: string, day: string) => {
    let s = days.get(user);
    if (!s) days.set(user, (s = new Set()));
    s.add(day);
  };
  const seconds = new Map<string, number>(); // per day
  const userSecondsByDay: { user: string; day: string; s: number }[] = [];
  for (const r of time) {
    const s = Number(r.seconds) || 0;
    if (s <= 0) continue;
    mark(r.user_id, r.day);
    seconds.set(r.day, (seconds.get(r.day) ?? 0) + s);
    userSecondsByDay.push({ user: r.user_id, day: r.day, s });
  }
  for (const r of rows) if (r.updated_at) mark(r.user_id, toDay(r.updated_at));
  const trackingFrom = time.reduce<string | null>((min, r) => (!min || r.day < min ? r.day : min), null);

  const activeIn = (a: string, b: string) => {
    const set = new Set<string>();
    for (const [u, ds] of days) for (const d of ds) if (inRange(d, a, b)) { set.add(u); break; }
    return set;
  };
  const returningIn = (a: string, b: string) => {
    let n = 0;
    for (const ds of days.values()) if ([...ds].filter((d) => inRange(d, a, b)).length >= 2) n++;
    return n;
  };
  const activeNow = activeIn(from, today);
  const activePrev = activeIn(prevFrom, prevTo);

  const signedIn = (a: string, b: string) => users.filter((u) => inRange(toDay(u.created_at), a, b));
  const newNow = signedIn(from, today);
  const newPrev = signedIn(prevFrom, prevTo);

  // Activation: new accounts in the period that have finished at least one part so far.
  const finishedAny = new Set(rows.filter((r) => doneCount(r.progress) > 0).map((r) => r.user_id));
  const activated = newNow.filter((u) => finishedAny.has(u.id)).length;

  const secondsIn = (a: string, b: string) => {
    let t = 0;
    for (const [d, s] of seconds) if (inRange(d, a, b)) t += s;
    return t;
  };
  const perUserNow = new Map<string, number>();
  for (const x of userSecondsByDay) if (inRange(x.day, from, today)) perUserNow.set(x.user, (perUserNow.get(x.user) ?? 0) + x.s);

  // Daily series for the chart (last 30 days, and the 30 days before) and the sparklines (the period).
  const series = (start: string, n: number, f: (d: string) => number) =>
    Array.from({ length: n }, (_, i) => f(addDays(start, i)));
  const activeOn = (d: string) => {
    let n = 0;
    for (const ds of days.values()) if (ds.has(d)) n++;
    return n;
  };
  const chartFrom = addDays(today, -29);
  const daily = {
    days: Array.from({ length: 30 }, (_, i) => addDays(chartFrom, i)),
    cur: series(chartFrom, 30, activeOn),
    prev: series(addDays(chartFrom, -30), 30, activeOn),
  };
  const spark = {
    active: series(from, range, activeOn),
    signups: series(from, range, (d) => users.filter((u) => toDay(u.created_at) === d).length),
    seconds: series(from, range, (d) => seconds.get(d) ?? 0),
  };

  // Funnel over every account.
  const opened = new Set<string>([...rows.map((r) => r.user_id), ...time.map((r) => r.user_id)]);
  const half = new Set<string>();
  const mocked = new Set<string>();
  for (const r of rows) {
    const g = guideById.get(r.guide_id);
    if (g && g.parts.length && doneCount(r.progress) >= Math.ceil(g.parts.length / 2)) half.add(r.user_id);
    if (hasMock(r.progress)) mocked.add(r.user_id);
  }
  const ids = new Set(users.map((u) => u.id));
  const count = (s: Set<string>) => [...s].filter((id) => ids.has(id)).length;
  const funnel = [
    { label: "Signed up", n: users.length },
    { label: "Opened a guide", n: count(opened) },
    { label: "Finished a part", n: count(finishedAny) },
    { label: "Half the parts done", n: count(half) },
    { label: "Took a mock exam", n: count(mocked) },
  ];

  // Weekly sign-up cohorts (last 4 weeks): share of each cohort active in each later week.
  const thisWeek = weekStart(today);
  const cohorts = [3, 2, 1, 0].map((back) => {
    const start = addDays(thisWeek, -7 * back);
    const members = users.filter((u) => weekStart(toDay(u.created_at)) === start);
    const cells = [0, 1, 2, 3].map((k) => {
      const ws = addDays(start, 7 * k);
      const we = addDays(ws, 6);
      if (ws > today || members.length === 0) return null;
      // Weeks that ended before study days were tracked cannot be measured.
      if (trackingFrom && we < trackingFrom) return null;
      const n = members.filter((u) => [...(days.get(u.id) ?? [])].some((d) => inRange(d, ws, we))).length;
      return { share: n / members.length, running: today <= we };
    });
    return { week: start, size: members.length, cells };
  });

  // Per guide: students, parts, accuracy, mocks, biggest drop between two parts.
  const guideCards = guides.map((g) => {
    const gr = rows.filter((r) => r.guide_id === g.id);
    const students = new Set<string>([...gr.map((r) => r.user_id), ...time.filter((t) => t.guide_id === g.id).map((t) => t.user_id)]);
    const n = students.size;
    const activeHere = new Set<string>();
    for (const t of time) if (t.guide_id === g.id && inRange(t.day, from, today)) activeHere.add(t.user_id);
    for (const r of gr) if (r.updated_at && inRange(toDay(r.updated_at), from, today)) activeHere.add(r.user_id);
    const parts = g.parts.map((p) => (n ? gr.filter((r) => r.progress.done?.[String(p.n)]).length / n : 0));
    let drop: { part: number; pts: number } | null = null;
    for (let i = 1; i < parts.length; i++) {
      const pts = Math.round(100 * (parts[i - 1] - parts[i]));
      if (pts > 0 && (!drop || pts > drop.pts)) drop = { part: g.parts[i].n, pts };
    }
    let answered = 0;
    let full = 0;
    for (const r of gr) {
      const a = answersOf(r.progress, g.single);
      for (const p of g.parts)
        for (const q of p.qs)
          if (Array.isArray(a[q.key])) {
            answered++;
            if (isFull(a[q.key], q.correct)) full++;
          }
    }
    const bests = gr.flatMap((r) =>
      Object.values(r.progress.mocks ?? {})
        .map((m) => (Array.isArray(m?.history) ? m.history.filter((h) => h.max > 0).map((h) => h.score / h.max) : []))
        .filter((xs) => xs.length > 0)
        .map((xs) => Math.max(...xs)),
    );
    const finishedAll = g.parts.length ? gr.filter((r) => g.parts.every((p) => r.progress.done?.[String(p.n)])).length : 0;
    return {
      id: g.id,
      slug: g.slug,
      title: g.title,
      mark: g.mark,
      students: n,
      active: activeHere.size,
      finishedAll: n ? finishedAll / n : 0,
      accuracy: answered ? full / answered : null,
      mockBest: bests.length ? bests.reduce((s, x) => s + x, 0) / bests.length : null,
      parts,
      partNumbers: g.parts.map((p) => p.n),
      drop: n >= 10 && drop && drop.pts >= 10 ? drop : null,
    };
  });

  // Needs attention: what the owner should look at first.
  const attention: Attention[] = [];
  const questions = guides.flatMap((g) => {
    const gr = rows.filter((r) => r.guide_id === g.id);
    return g.parts.flatMap((p) =>
      p.qs.map((q) => {
        const answers = gr.map((r) => answersOf(r.progress, g.single)[q.key]).filter((a): a is string[] => Array.isArray(a));
        const full = answers.filter((a) => isFull(a, q.correct)).length;
        return { guide: g, part: p.n, stem: q.stem, n: answers.length, p: answers.length ? full / answers.length : 1 };
      }),
    );
  });
  const broken = questions.filter((q) => q.n >= 30 && q.p < 0.25).sort((a, b) => a.p - b.p);
  if (broken.length) {
    const q = broken[0];
    attention.push({
      tone: "critical",
      title: broken.length === 1 ? "1 question may have a wrong key" : `${broken.length} questions may have a wrong key`,
      detail: `${q.guide.mark} · Part ${q.part} · ${Math.round(100 * q.p)} % right of ${q.n}`,
      href: "/app/admin/guides",
    });
  }
  const soon = addDays(today, 6);
  const examStudents = new Map<string, boolean>(); // user → behind
  for (const r of rows) {
    const d = r.progress.exam?.date;
    const g = guideById.get(r.guide_id);
    if (!d || !g || !inRange(d, today, soon)) continue;
    const behind = doneCount(r.progress) < Math.ceil(g.parts.length / 2);
    examStudents.set(r.user_id, (examStudents.get(r.user_id) ?? false) || behind);
  }
  if (examStudents.size) {
    const behind = [...examStudents.values()].filter(Boolean).length;
    attention.push({
      tone: behind ? "warning" : "info",
      title: behind ? `${behind} behind before an exam` : `${examStudents.size} with an exam this week`,
      detail: `${examStudents.size} ${examStudents.size === 1 ? "student has" : "students have"} an exam within 7 days; behind = under half the parts done`,
      href: "/app/admin/students",
    });
  }
  const worst = guideCards.filter((g) => g.drop).sort((a, b) => b.drop!.pts - a.drop!.pts)[0];
  if (worst?.drop) {
    attention.push({
      tone: "info",
      title: `${worst.mark} Part ${worst.drop.part} loses ${worst.drop.pts} points`,
      detail: "Biggest drop between two parts. Check the video and the quiz there.",
      href: "/app/admin/guides",
    });
  }
  const wanted = new Map<string, { title: string; n: number }>();
  for (const p of packs) {
    const k = p.title.trim().toLowerCase().replace(/\s+/g, " ");
    if (!k) continue;
    const w = wanted.get(k) ?? { title: p.title.trim(), n: 0 };
    w.n++;
    wanted.set(k, w);
  }
  const top = [...wanted.values()].sort((a, b) => b.n - a.n)[0];
  if (top && top.n >= 2) {
    attention.push({ tone: "info", title: `${top.n} requests for ${top.title}`, detail: "Most asked-for new guide", href: "/app/admin/students" });
  }

  return {
    period: { from, to: today, prevFrom, prevTo },
    // Study days are only known from the first guide_time row: before that, comparisons of activity are not fair.
    comparable: trackingFrom !== null && trackingFrom <= prevFrom,
    active: { now: activeNow.size, prev: activePrev.size },
    signups: { now: newNow.length, prev: newPrev.length },
    activation: { rate: newNow.length ? activated / newNow.length : null, n: newNow.length },
    returning: {
      now: activeNow.size ? returningIn(from, today) / activeNow.size : null,
      prev: activePrev.size ? returningIn(prevFrom, prevTo) / activePrev.size : null,
      n: activeNow.size,
    },
    study: { now: secondsIn(from, today), prev: secondsIn(prevFrom, prevTo), median: median([...perUserNow.values()]) },
    spark,
    daily,
    trackingFrom,
    funnel,
    cohorts,
    guides: guideCards,
    attention,
  };
}

export type Overview = ReturnType<typeof computeOverview>;

// "Student 3f2a91": a short, stable label instead of the email.
export const studentLabel = (id: string) => `Student ${id.replace(/-/g, "").slice(0, 6)}`;
