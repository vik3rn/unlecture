import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { dayIn, dayStart, formatDuration } from "@/lib/guide-time";
import { examInstant, formatExam, type ExamSetting } from "@/lib/guides";
import { createClient } from "@/lib/supabase/server";
import "./my-guides.css";

// /app, "Your guides": a card per guide (progress squares, the next part to study, the student's own exam date),
// a strip with this week's study time, parts done and the next exam, and the announced Management Control guide.
// Light data only: the guide rows plus `content->outline` / `content->tags` / `content->>mark` (small, written by
// the seed), never the whole guide content. Styles in my-guides.css, scoped to .mg, as wide as the header (1440 px).
// TEMPORARY until after Fri 16 Oct 2026: the study list (core-input, core-submit, core-item) is hidden (see
// CLAUDE.md). Bring it back as a "Need a guide for another course?" panel at the bottom (code removed in cffeb04).

export const metadata: Metadata = { title: "Your guides" };

type Outline = { n: number; title: string; dur?: string };
type Guide = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  part_count: number;
  outline: unknown;
  tags: unknown;
  mark: string | null;
};
type ProgressRow = { guide_id: string; done: Record<string, boolean> | null; exam: ExamSetting | null };

// Time-dependent helpers live outside the components (components must stay pure).
function now() {
  return Date.now();
}
function untilText(at: number) {
  const ms = at - now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d} d ${h % 24} h` : `${h} h ${Math.floor((ms % 3_600_000) / 60_000)} min`;
}
function weekStart() {
  return dayStart(dayIn(new Date(now())), 7);
}

function markOf(g: Guide) {
  if (g.mark && /^[A-Za-z0-9]{1,4}$/.test(g.mark)) return g.mark;
  return g.title
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 3);
}

function safeOutline(v: unknown): Outline[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((o): o is Outline => {
      const x = o as Partial<Outline> | null;
      return !!x && typeof x === "object" && Number.isInteger(x.n) && typeof x.title === "string";
    })
    .slice(0, 200)
    .map((o) => ({ n: o.n, title: o.title.slice(0, 200), dur: typeof o.dur === "string" ? o.dur.slice(0, 12) : undefined }));
}

function safeTags(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((t): t is string => typeof t === "string").slice(0, 6).map((t) => t.slice(0, 40))
    : [];
}

async function Guides() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  // RLS: every logged-in user can read guides; progress and study-time rows are the user's own.
  const [guidesResult, progressResult, timeResult] = await Promise.all([
    supabase
      .from("guides")
      .select("id, slug, title, summary, part_count, outline:content->outline, tags:content->tags, mark:content->>mark")
      .order("created_at", { ascending: true }),
    supabase.from("guide_progress").select("guide_id, done:progress->done, exam:progress->exam"),
    supabase.from("guide_time").select("seconds").gte("day", weekStart()),
  ]);

  if (guidesResult.error) {
    return <div className="mg-empty">The guides could not be loaded right now. Please try again in a moment.</div>;
  }

  const guides = (guidesResult.data ?? []) as Guide[];
  const rows = (progressResult.data ?? []) as ProgressRow[];
  const byGuide = new Map(rows.map((r) => [r.guide_id, r]));
  const weekSeconds = timeResult.error
    ? 0
    : (timeResult.data ?? []).reduce((s, r) => s + (Number((r as { seconds: unknown }).seconds) || 0), 0);
  const doneTotal = guides.reduce(
    (s, g) => s + Math.min(Object.keys(byGuide.get(g.id)?.done ?? {}).length, g.part_count),
    0,
  );
  const upcoming = rows
    .map((r) => (r.exam ? examInstant(r.exam) : NaN))
    .filter((t) => Number.isFinite(t) && untilText(t) !== null)
    .sort((a, b) => a - b);
  const nextExam = upcoming.length ? untilText(upcoming[0]) : null;
  const mcLive = guides.some((g) => g.slug.startsWith("management-control"));

  return (
    <>
      <ul className="mg-stats" aria-label="Your week">
        <li>
          <span>Studied this week</span>
          <b>{formatDuration(weekSeconds)}</b>
        </li>
        <li>
          <span>Parts done</span>
          <b>{doneTotal}</b>
        </li>
        <li className="warm">
          <span>Next exam</span>
          <b>{nextExam ? `in ${nextExam}` : "No date yet"}</b>
        </li>
      </ul>

      {guides.length === 0 && (
        <div className="mg-empty">No guides yet. New guides show up here when they are published.</div>
      )}

      {guides.map((g) => {
        const row = byGuide.get(g.id);
        const done = row?.done ?? {};
        const outline = safeOutline(g.outline);
        const parts = outline.length
          ? outline
          : Array.from({ length: g.part_count }, (_, n): Outline => ({ n, title: "" }));
        const doneCount = Math.min(parts.filter((p) => done[String(p.n)]).length, g.part_count);
        const pct = g.part_count ? Math.round((100 * doneCount) / g.part_count) : 0;
        const next = parts.find((p) => !done[String(p.n)]);
        const exam = row?.exam ?? null;
        const examAt = exam ? examInstant(exam) : NaN;
        const until = Number.isFinite(examAt) ? untilText(examAt) : null;
        const tags = safeTags(g.tags);
        return (
          <article key={g.id} className="mg-guide" aria-labelledby={`g-${g.id}`}>
            <div className="mg-main">
              <div className="mg-head">
                <div className="mg-mark" aria-hidden="true">
                  {markOf(g)}
                </div>
                <div className="mg-name">
                  <h2 id={`g-${g.id}`}>{g.title}</h2>
                  <div className="mg-tags">
                    {tags.map((t, i) => (
                      <span key={t} className={i === 0 ? "tag strong" : "tag"}>
                        {t}
                      </span>
                    ))}
                    <span className="tag">{g.part_count} parts</span>
                  </div>
                </div>
              </div>
              <div className="mg-progress">
                <div className="mg-progress-top">
                  <span>
                    <b>
                      {doneCount} of {g.part_count}
                    </b>{" "}
                    parts done
                  </span>
                  <span>{pct} %</span>
                </div>
                <div className="mg-bar" aria-hidden="true">
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
              <ol className="mg-squares" aria-label="Parts">
                {parts.map((p) => {
                  const isDone = !!done[String(p.n)];
                  const isNext = next?.n === p.n;
                  const state = isDone ? " (done)" : isNext ? " (up next)" : "";
                  return (
                    <li key={p.n}>
                      <Link
                        href={`/app/guides/${g.slug}/${p.n}`}
                        className={isDone ? "sq done" : isNext ? "sq next" : "sq"}
                        aria-label={`Part ${p.n}${p.title ? `: ${p.title}` : ""}${state}`}
                        title={p.title || `Part ${p.n}`}
                      >
                        {p.n}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="mg-next">
              <span className="cap">{next ? "Up next" : "All parts done"}</span>
              {next ? (
                <>
                  <b>
                    Part {next.n}
                    {next.title ? ` · ${next.title}` : ""}
                  </b>
                  {next.dur && <span className="meta">Video {next.dur}</span>}
                  <div className="acts">
                    <Link href={`/app/guides/${g.slug}/${next.n}`} className="btn">
                      {doneCount ? "Continue" : "Start"} <span aria-hidden="true">→</span>
                    </Link>
                    <Link href={`/app/guides/${g.slug}`} className="link">
                      Course overview
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <b>Well done. Revise with the quizzes and the paper exercises.</b>
                  <div className="acts">
                    <Link href={`/app/guides/${g.slug}`} className="btn">
                      Course overview <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </>
              )}
            </div>

            <div className="mg-exam">
              <span className="cap">Your exam</span>
              {exam ? (
                <>
                  <b>{until ?? "Done"}</b>
                  <span className="meta">{formatExam(exam)}</span>
                  <Link href={`/app/guides/${g.slug}#exam`} className="link">
                    Change date
                  </Link>
                </>
              ) : (
                <>
                  <span className="meta">Exam dates differ between classes. Add yours for a countdown.</span>
                  <Link href={`/app/guides/${g.slug}#exam`} className="link">
                    Add your exam date
                  </Link>
                </>
              )}
            </div>
          </article>
        );
      })}

      {/* Announced guide: disappears by itself once a Management Control guide is published. */}
      {!mcLive && (
        <article className="mg-soon" aria-labelledby="mc-soon">
          <div className="mg-mark warm" aria-hidden="true">
            MC
          </div>
          <div className="mg-soon-body">
            <div className="mg-soon-title">
              <h2 id="mc-soon">Management Control</h2>
              <span className="badge">Coming Friday 16 October</span>
            </div>
            <div className="mg-tags">
              <span className="tag light">Midterm</span>
              <span className="tag light">Topics 1–5</span>
              <span className="tag light">17 parts</span>
              <span className="tag light">4 timed mock exams</span>
            </div>
          </div>
          <p>It appears here when it is published. Your progress starts the moment you open it.</p>
        </article>
      )}
    </>
  );
}

export default function AppPage() {
  return (
    <main id="main" className="mg">
      <div className="mg-wrap">
        <div className="mg-top">
          <h1>Your guides</h1>
          <p>Pick up where you left off. Your parts, answers, score and exam date are saved to your account.</p>
        </div>
        <Suspense fallback={<p className="mg-loading">Loading your guides…</p>}>
          <Guides />
        </Suspense>
      </div>
    </main>
  );
}
