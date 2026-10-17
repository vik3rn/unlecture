import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isAdmin } from "@/lib/admin";
import { loadAdminData } from "@/lib/admin-data";
import { studentLabel, type AdminProgress } from "@/lib/admin-metrics";
import { dayIn, dayStart, formatDuration, OTHER_PART, summarizeTime, type UserTime } from "@/lib/guide-time";
import { plain, questionKeys } from "@/lib/guides";
import type { MockState } from "@/lib/progress";
import { bestScore, fmtPoints } from "@/lib/scoring";
import { getCurrentUser } from "@/lib/supabase/server";

// Per guide (owner only): study time, parts done with time per part, the hardest questions, mock exams and the
// guide's students. Students show as short IDs; emails only with ?emails=1 (the "Show emails" button).
export const metadata: Metadata = { title: "Guides and questions", robots: { index: false, follow: false } };

type Row = { user_id: string; guide_id: string; progress: AdminProgress; updated_at: string | null };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
const when = (iso?: string | null) => (iso ? day.format(new Date(iso)) : "–");
// guide_time.day is already a Madrid calendar day (YYYY-MM-DD): format it as is.
const calendarDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const onDay = (d?: string | null) => (d ? calendarDay.format(new Date(`${d}T00:00:00Z`)) : "–");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)} %` : "–");
const share = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);
// Most recent of the last saved progress and the last day studied, for sorting.
const lastSeen = (r: Row, t?: UserTime) =>
  Math.max(r.updated_at ? Date.parse(r.updated_at) : 0, t?.last ? Date.parse(`${t.last}T23:59:59Z`) : 0);
// Time-dependent helpers live outside the components (components must stay pure).
function today() {
  return dayIn(new Date());
}

async function GuidesView({ searchParams }: { searchParams: PageProps<"/app/admin/guides">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me.email)) notFound();
  const showEmails = (await searchParams).emails === "1";

  const data = await loadAdminData();
  if (data.error !== null) {
    return (
      <p role="alert" className="ad-error">
        {data.error}
      </p>
    );
  }
  const emailOf = new Map(data.users.map((u) => [u.id, u.email ?? "(no email)"]));
  const who = (id: string) => (showEmails ? (emailOf.get(id) ?? id) : studentLabel(id));
  // Study time: "last 7 days" = today and the 6 days before, in the time zone the database uses for `day`.
  const time = summarizeTime(data.time.rows, dayStart(today(), 7));
  const timeOn = !data.time.missing && !data.time.error;
  const rows = data.rows as Row[];

  return (
    <>
      <header className="ad-head">
        <div>
          <h1>Guides and questions</h1>
          <p>Per guide: study time, parts, the hardest questions, mock exams and students</p>
        </div>
        <div className="ad-tools">
          <Link href={showEmails ? "/app/admin/guides" : "/app/admin/guides?emails=1"} className="ad-btn">
            {showEmails ? "Hide emails" : "Show emails"}
          </Link>
        </div>
      </header>
      {showEmails && (
        <p className="ad-note">
          <b>Confidential.</b> Emails are visible. Do not share this page or copy the list anywhere else.
        </p>
      )}

      {data.guides.map((g) => {
        const gt = time.guides.get(g.id);
        const gr = rows.filter((r) => r.guide_id === g.id);
        // Students with study time but no saved progress yet count as students of the guide too.
        for (const id of gt?.users.keys() ?? []) {
          if (!gr.some((r) => r.user_id === id)) gr.push({ user_id: id, guide_id: g.id, progress: {}, updated_at: null });
        }
        const timeUsers = gt?.users.size ?? 0;
        const studied = (id: string) => gt?.users.get(id);
        const partTime = (n: number) => {
          const x = gt?.parts.get(n);
          return x && x.users.size > 0 ? formatDuration(x.total / x.users.size) : "–";
        };
        const parts = g.content.parts;
        const items = parts.flatMap((p) => questionKeys(p).map(({ q, key }) => ({ p, q, key })));
        // One correct option: answers are single letters in progress.pick ("" = blank). Otherwise letter lists in quiz.
        const single = g.content.format.correct === 1;
        const answersOf = (pr: AdminProgress) =>
          single
            ? Object.fromEntries(Object.entries(pr.pick ?? {}).map(([k, v]) => [k, v ? [v] : []]))
            : (pr.quiz ?? {});
        const isFull = (a: unknown, correct: string[]) =>
          Array.isArray(a) && a.length === correct.length && a.every((x) => correct.includes(x));
        const perQuestion = items
          .map(({ p, q, key }) => {
            const answers = gr.map((r) => answersOf(r.progress)[key]).filter((a): a is string[] => Array.isArray(a));
            const full = answers.filter((a) => isFull(a, q.correct)).length;
            // The wrong option picked most often (single-answer guides), to spot a wrong key.
            const wrong = new Map<string, number>();
            for (const a of answers) for (const x of a) if (!q.correct.includes(x)) wrong.set(x, (wrong.get(x) ?? 0) + 1);
            const top = [...wrong].sort((a, b) => b[1] - a[1])[0];
            return { part: p.n, key, stem: plain(q.stem).slice(0, 110), n: answers.length, full, top };
          })
          .filter((x) => x.n > 0)
          .sort((a, b) => a.full / a.n - b.full / b.n);
        return (
          <section key={g.id} className="ad-card" aria-labelledby={`g-${g.slug}`}>
            <div className="ad-card-head">
              <h2 id={`g-${g.slug}`}>{g.title}</h2>
              <span>{gr.length} students</span>
            </div>

            {timeOn && (
              <ul className="ad-kpis" aria-label={`Study time in ${g.title}`}>
                <li className="ad-kpi">
                  <span className="ad-kpi-label">Study time, total</span>
                  <div className="ad-kpi-value">
                    <b style={{ fontSize: 24 }}>{formatDuration(gt?.total ?? 0)}</b>
                  </div>
                </li>
                <li className="ad-kpi">
                  <span className="ad-kpi-label">Students with study time</span>
                  <div className="ad-kpi-value">
                    <b style={{ fontSize: 24 }}>{timeUsers}</b>
                  </div>
                </li>
                <li className="ad-kpi">
                  <span className="ad-kpi-label">Average per student</span>
                  <div className="ad-kpi-value">
                    <b style={{ fontSize: 24 }}>{timeUsers ? formatDuration((gt?.total ?? 0) / timeUsers) : "–"}</b>
                  </div>
                </li>
              </ul>
            )}

            <div>
              <h3>Parts marked done{timeOn && ", and average study time"}</h3>
              {timeOn && <p className="ad-sub" style={{ margin: "4px 0 0" }}>Time: average per student who spent time on that part.</p>}
              <div className="ad-scroll">
                <table className="ad-table" style={{ minWidth: 520, marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th scope="col">Part</th>
                      <th scope="col" style={{ width: "50%" }}>
                        Done
                      </th>
                      <th scope="col" className="r">
                        Students
                      </th>
                      {timeOn && (
                        <th scope="col" className="r">
                          Time
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p) => {
                      const n = gr.filter((r) => r.progress.done?.[String(p.n)]).length;
                      return (
                        <tr key={p.n}>
                          <td className="num">{p.n}</td>
                          <td>
                            <div className="ad-mini">
                              <div className="ad-bar" aria-hidden="true">
                                <i style={{ width: `${share(n, gr.length)}%` }} />
                              </div>
                              <span className="num">{pct(n, gr.length)}</span>
                            </div>
                          </td>
                          <td className="r">{n}</td>
                          {timeOn && <td className="r">{partTime(p.n)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {timeOn && gt?.parts.has(OTHER_PART) && (
                <p className="ad-sub" style={{ margin: "6px 0 0" }}>
                  Course overview, mock exams and other pages: {partTime(OTHER_PART)} per student on average.
                </p>
              )}
            </div>

            <div>
              <h3>Hardest questions</h3>
              <p className="ad-sub" style={{ margin: "4px 0 0" }}>
                Lowest share fully right first. Under 25 % right with 30 or more answers: check the answer key.
              </p>
              <div className="ad-scroll">
                <table className="ad-table" style={{ minWidth: 620, marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th scope="col">Part</th>
                      <th scope="col">Question</th>
                      <th scope="col" className="r">
                        Answers
                      </th>
                      <th scope="col" className="r">
                        Fully right
                      </th>
                      <th scope="col">Most-picked wrong</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perQuestion.slice(0, 12).map((x) => (
                      <tr key={x.key}>
                        <td className="num">{x.part}</td>
                        <td>
                          {x.stem}…
                          {x.n >= 30 && x.full / x.n < 0.25 && (
                            <>
                              {" "}
                              <span className="ad-pill down">Check the key</span>
                            </>
                          )}
                        </td>
                        <td className="r">{x.n}</td>
                        <td className="r">{pct(x.full, x.n)}</td>
                        <td className="num">{x.top ? `${x.top[0]} · ${pct(x.top[1], x.n)}` : "–"}</td>
                      </tr>
                    ))}
                    {perQuestion.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          No answers yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {g.content.mocks.length > 0 && (
              <div>
                <h3>Mock exams</h3>
                <div className="ad-scroll">
                  <table className="ad-table" style={{ minWidth: 560, marginTop: 6 }}>
                    <thead>
                      <tr>
                        <th scope="col">Mock</th>
                        <th scope="col" className="r">
                          Students
                        </th>
                        <th scope="col" className="r">
                          Submitted attempts
                        </th>
                        <th scope="col" className="r">
                          Average best
                        </th>
                        <th scope="col" className="r">
                          Average last
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.content.mocks.map((m) => {
                        const states = gr
                          .map((r) => r.progress.mocks?.[m.id])
                          .filter((x): x is MockState => !!x && Array.isArray(x.history));
                        const scored = states.filter((x) => x.history.length > 0);
                        const avg = (pickScore: (x: MockState) => { score: number; max: number } | null | undefined) => {
                          const v = scored.map(pickScore).filter((x): x is { score: number; max: number } => !!x && x.max > 0);
                          return v.length ? `${Math.round((100 * v.reduce((a, x) => a + x.score / x.max, 0)) / v.length)} %` : "–";
                        };
                        return (
                          <tr key={m.id}>
                            <td>
                              {plain(m.title)} <span className="muted">({fmtPoints(m.size.points)} points)</span>
                            </td>
                            <td className="r">{states.length}</td>
                            <td className="r">{scored.reduce((a, x) => a + x.history.length, 0)}</td>
                            <td className="r">{avg((x) => bestScore(x.history))}</td>
                            <td className="r">{avg((x) => x.history.at(-1))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h3>Students</h3>
              <div className="ad-scroll">
                <table className="ad-table" style={{ minWidth: 760, marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col" className="r">
                        Parts done
                      </th>
                      <th scope="col" className="r">
                        Answered
                      </th>
                      <th scope="col" className="r">
                        Fully right
                      </th>
                      <th scope="col">Exam date</th>
                      {timeOn && (
                        <>
                          <th scope="col" className="r">
                            Study time
                          </th>
                          <th scope="col" className="r">
                            Last 7 days
                          </th>
                          <th scope="col">Last studied</th>
                        </>
                      )}
                      <th scope="col">Last saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gr
                      .slice()
                      .sort((a, b) => lastSeen(b, studied(b.user_id)) - lastSeen(a, studied(a.user_id)))
                      .map((r) => {
                        const quiz = answersOf(r.progress);
                        const answered = Object.keys(quiz).length;
                        const full = items.filter(({ q, key }) => isFull(quiz[key], q.correct)).length;
                        return (
                          <tr key={r.user_id}>
                            <td className={showEmails ? undefined : "who"} style={showEmails ? { wordBreak: "break-all" } : undefined}>
                              {who(r.user_id)}
                            </td>
                            <td className="r">
                              {Object.keys(r.progress.done ?? {}).length}/{parts.length}
                            </td>
                            <td className="r">
                              {answered}/{items.length}
                            </td>
                            <td className="r">{pct(full, answered)}</td>
                            <td>{r.progress.exam?.date ?? "–"}</td>
                            {timeOn && (
                              <>
                                <td className="r">{formatDuration(studied(r.user_id)?.total ?? 0)}</td>
                                <td className="r">{formatDuration(studied(r.user_id)?.recent ?? 0)}</td>
                                <td>{onDay(studied(r.user_id)?.last)}</td>
                              </>
                            )}
                            <td>{when(r.updated_at)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}

export default function AdminGuidesPage({ searchParams }: PageProps<"/app/admin/guides">) {
  return (
    <Suspense fallback={<p className="ad-loading">Loading the guides…</p>}>
      <GuidesView searchParams={searchParams} />
    </Suspense>
  );
}
