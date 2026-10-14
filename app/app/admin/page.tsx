import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isAdmin } from "@/lib/admin";
import { dayIn, dayStart, formatDuration, OTHER_PART, summarizeTime, type TimeRow, type UserTime } from "@/lib/guide-time";
import { parseGuideContent, plain, questionKeys } from "@/lib/guides";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

// Owner-only overview of how students use the guides. It shows personal data (emails, progress and study time), so
// it is reachable only for ADMIN_EMAILS, is never indexed, and reads with the server-only secret key.
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

type Progress = { done?: Record<string, boolean>; quiz?: Record<string, string[]>; exam?: { date: string } };
// updated_at is null for a student who has study time in a guide but has not saved any progress there yet.
type Row = { user_id: string; guide_id: string; progress: Progress; updated_at: string | null };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
const when = (iso?: string | null) => (iso ? day.format(new Date(iso)) : "–");
// guide_time.day is already a Madrid calendar day (YYYY-MM-DD): format it as is.
const calendarDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const onDay = (d?: string | null) => (d ? calendarDay.format(new Date(`${d}T00:00:00Z`)) : "–");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)} %` : "–");
const share = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);
// Runs per request on the server (the page reads cookies, so it is never prerendered).
const withinDays = (iso: string | null | undefined, days: number) =>
  !!iso && Date.now() - Date.parse(iso) < days * 86_400_000;
// Most recent of the last saved progress and the last day studied, for sorting.
const lastSeen = (r: Row, t?: UserTime) =>
  Math.max(r.updated_at ? Date.parse(r.updated_at) : 0, t?.last ? Date.parse(`${t.last}T23:59:59Z`) : 0);

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
const PAGE = 1000;
const MAX_TIME_ROWS = 200_000;

// guide_time has one row per student, guide, day and part, so it can pass the API's row limit: read it in pages
// until a page comes back empty (works whatever the project's "max rows" is). missing = migration 0004 not run.
async function loadStudyTime(admin: Admin): Promise<{ rows: TimeRow[]; missing: boolean; error: string | null }> {
  const rows: TimeRow[] = [];
  while (rows.length < MAX_TIME_ROWS) {
    const { data, error } = await admin
      .from("guide_time")
      .select("user_id, guide_id, day, part, seconds")
      .order("user_id")
      .order("guide_id")
      .order("day")
      .order("part")
      .range(rows.length, rows.length + PAGE - 1);
    if (error) {
      const missing = error.code === "PGRST205" || error.code === "42P01";
      return { rows: [], missing, error: missing ? null : error.message };
    }
    if (!data?.length) break;
    rows.push(...(data as TimeRow[]));
  }
  return { rows, missing: false, error: null };
}

async function Dashboard() {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me.email)) notFound();

  const admin = createAdminClient();
  if (!admin) return <p className="text-danger">The server key is not set (SUPABASE_SECRET_KEY).</p>;

  const [usersRes, guidesRes, progRes, timeRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("guides").select("id, slug, title, content"),
    admin.from("guide_progress").select("user_id, guide_id, progress, updated_at"),
    loadStudyTime(admin),
  ]);
  if (usersRes.error || guidesRes.error || progRes.error) {
    return (
      <p role="alert" className="text-danger">
        Could not load the data: {usersRes.error?.message ?? guidesRes.error?.message ?? progRes.error?.message}
      </p>
    );
  }

  const users = usersRes.data.users;
  const rows = (progRes.data ?? []) as Row[];
  const newUsers = users.filter((u) => withinDays(u.created_at, 7)).length;
  const active = users.filter((u) => withinDays(u.last_sign_in_at, 7)).length;
  const emailOf = new Map(users.map((u) => [u.id, u.email ?? "(no email)"]));
  // Study time: "last 7 days" = today and the 6 days before, in the time zone the database uses for `day`.
  const time = summarizeTime(timeRes.rows, dayStart(dayIn(new Date()), 7));
  const timeOn = !timeRes.missing && !timeRes.error;

  const guides = (guidesRes.data ?? []).map((g) => ({
    id: g.id as string,
    slug: g.slug as string,
    title: g.title as string,
    content: parseGuideContent(g.content),
  }));

  return (
    <div className="space-y-10">
      <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-ink">
        <b>Confidential.</b> This page shows students&rsquo; email addresses, study progress and study time. Do not share
        it or copy the list anywhere else.
      </p>

      <section aria-labelledby="totals">
        <h2 id="totals" className="text-lg font-semibold">
          Users
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Accounts", users.length],
            ["New in 7 days", newUsers],
            ["Signed in within 7 days", active],
            ["Using a guide", new Set([...rows.map((r) => r.user_id), ...timeRes.rows.map((r) => r.user_id)]).size],
            ["Study time in 7 days", timeOn ? formatDuration(time.recent) : "–"],
          ].map(([label, value]) => (
            <li key={label as string} className="rounded-xl bg-tint p-4">
              <span className="block text-sm text-muted">{label}</span>
              <span className="block text-2xl font-semibold tabular-nums">{value}</span>
            </li>
          ))}
        </ul>
        {timeRes.missing && (
          <p className="mt-3 text-sm text-muted">
            Run <code>supabase/migrations/0004_guide_time.sql</code> to start measuring study time.
          </p>
        )}
        {timeRes.error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            Could not load study time: {timeRes.error}
          </p>
        )}
      </section>

      {guides.map((g) => {
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
        const perQuestion = items
          .map(({ p, q, key }) => {
            const answers = gr.map((r) => r.progress.quiz?.[key]).filter((a): a is string[] => Array.isArray(a));
            const full = answers.filter((a) => a.every((x) => q.correct.includes(x)) && a.length === q.correct.length).length;
            return { part: p.n, key, stem: plain(q.stem).slice(0, 110), n: answers.length, full };
          })
          .filter((x) => x.n > 0)
          .sort((a, b) => a.full / a.n - b.full / b.n);
        return (
          <section key={g.id} aria-labelledby={`g-${g.slug}`} className="space-y-6">
            <h2 id={`g-${g.slug}`} className="text-lg font-semibold">
              {g.title} <span className="font-normal text-muted">({gr.length} students)</span>
            </h2>

            {timeOn && (
              <div>
                <h3 className="font-medium">Study time</h3>
                <ul className="mt-2 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Total", formatDuration(gt?.total ?? 0)],
                    ["Students with time", timeUsers],
                    ["Average per active student", timeUsers ? formatDuration((gt?.total ?? 0) / timeUsers) : "–"],
                  ].map(([label, value]) => (
                    <li key={label as string} className="rounded-xl bg-tint p-4">
                      <span className="block text-sm text-muted">{label}</span>
                      <span className="block text-xl font-semibold tabular-nums">{value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="font-medium">Parts marked done{timeOn && " and average study time"}</h3>
              {timeOn && (
                <p className="mt-1 text-sm text-muted">
                  Time on the right: average per student who spent time on that part.
                </p>
              )}
              <ul className="mt-2 space-y-1.5">
                {parts.map((p) => {
                  const n = gr.filter((r) => r.progress.done?.[String(p.n)]).length;
                  return (
                    <li
                      key={p.n}
                      className={`grid ${timeOn ? "grid-cols-[3rem_minmax(0,1fr)_5rem_6rem]" : "grid-cols-[3rem_minmax(0,1fr)_5rem]"} items-center gap-3 text-sm`}
                    >
                      <span className="tabular-nums text-muted">Part {p.n}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-accent-soft">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${share(n, gr.length)}%` }} />
                      </span>
                      <span className="text-right tabular-nums">
                        {n} · {pct(n, gr.length)}
                      </span>
                      {timeOn && <span className="text-right tabular-nums">{partTime(p.n)}</span>}
                    </li>
                  );
                })}
              </ul>
              {timeOn && gt?.parts.has(OTHER_PART) && (
                <p className="mt-2 text-sm text-muted">
                  Course overview and other pages: {partTime(OTHER_PART)} per student on average.
                </p>
              )}
            </div>

            <div>
              <h3 className="font-medium">Hardest questions (lowest share fully correct)</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-2 pr-3 font-medium">Part</th>
                      <th className="py-2 pr-3 font-medium">Question</th>
                      <th className="py-2 pr-3 text-right font-medium">Answers</th>
                      <th className="py-2 text-right font-medium">Fully correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perQuestion.slice(0, 12).map((x) => (
                      <tr key={x.key} className="border-b border-line">
                        <td className="py-2 pr-3 tabular-nums">{x.part}</td>
                        <td className="py-2 pr-3">{x.stem}…</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{x.n}</td>
                        <td className="py-2 text-right tabular-nums">{pct(x.full, x.n)}</td>
                      </tr>
                    ))}
                    {perQuestion.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-3 text-muted">
                          No answers yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="font-medium">Students</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-2 pr-3 font-medium">Email</th>
                      <th className="py-2 pr-3 text-right font-medium">Parts done</th>
                      <th className="py-2 pr-3 text-right font-medium">Answered</th>
                      <th className="py-2 pr-3 text-right font-medium">Fully correct</th>
                      <th className="py-2 pr-3 font-medium">Exam date</th>
                      {timeOn && (
                        <>
                          <th className="py-2 pr-3 text-right font-medium">Study time</th>
                          <th className="py-2 pr-3 text-right font-medium">Last 7 days</th>
                          <th className="py-2 pr-3 font-medium">Last studied</th>
                        </>
                      )}
                      <th className="py-2 font-medium">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gr
                      .slice()
                      .sort((a, b) => lastSeen(b, studied(b.user_id)) - lastSeen(a, studied(a.user_id)))
                      .map((r) => {
                        const quiz = r.progress.quiz ?? {};
                        const answered = Object.keys(quiz).length;
                        const full = items.filter(({ q, key }) => {
                          const a = quiz[key];
                          return Array.isArray(a) && a.length === q.correct.length && a.every((x) => q.correct.includes(x));
                        }).length;
                        return (
                          <tr key={r.user_id} className="border-b border-line">
                            <td className="py-2 pr-3 break-all">{emailOf.get(r.user_id) ?? r.user_id}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {Object.keys(r.progress.done ?? {}).length}/{parts.length}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {answered}/{items.length}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{pct(full, answered)}</td>
                            <td className="py-2 pr-3">{r.progress.exam?.date ?? "–"}</td>
                            {timeOn && (
                              <>
                                <td className="py-2 pr-3 text-right tabular-nums">
                                  {formatDuration(studied(r.user_id)?.total ?? 0)}
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums">
                                  {formatDuration(studied(r.user_id)?.recent ?? 0)}
                                </td>
                                <td className="py-2 pr-3">{onDay(studied(r.user_id)?.last)}</td>
                              </>
                            )}
                            <td className="py-2">{when(r.updated_at)}</td>
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

      <section aria-labelledby="all-users">
        <h2 id="all-users" className="text-lg font-semibold">
          All accounts
        </h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Signed up</th>
                <th className="py-2 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users
                .slice()
                .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
                .map((u) => (
                  <tr key={u.id} className="border-b border-line">
                    <td className="py-2 pr-3 break-all">{u.email}</td>
                    <td className="py-2 pr-3">{when(u.created_at)}</td>
                    <td className="py-2">{when(u.last_sign_in_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Dashboard />
        </Suspense>
      </div>
    </main>
  );
}
