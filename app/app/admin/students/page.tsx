import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isAdmin } from "@/lib/admin";
import { guideMark, loadAdminData } from "@/lib/admin-data";
import { studentLabel } from "@/lib/admin-metrics";
import { formatDuration } from "@/lib/guide-time";
import { getCurrentUser } from "@/lib/supabase/server";

// Every account (owner only): when it signed up and last signed in, the guides it uses, parts done, study time and
// exam dates, plus the courses students ask guides for. Students show as short IDs; emails only with ?emails=1.
export const metadata: Metadata = { title: "Students", robots: { index: false, follow: false } };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
const when = (iso?: string | null) => (iso ? day.format(new Date(iso)) : "–");
const calendarDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const onDay = (d?: string | null) => (d ? calendarDay.format(new Date(`${d}T00:00:00Z`)) : "–");

async function StudentsView({ searchParams }: { searchParams: PageProps<"/app/admin/students">["searchParams"] }) {
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
  const markOf = new Map(data.guides.map((g) => [g.id, guideMark(g)]));
  const partsOf = new Map(data.guides.map((g) => [g.id, g.content.parts.length]));
  const per = new Map<string, { guides: Set<string>; done: number; parts: number; seconds: number; last: string; exams: string[] }>();
  const get = (id: string) => {
    let x = per.get(id);
    if (!x) per.set(id, (x = { guides: new Set(), done: 0, parts: 0, seconds: 0, last: "", exams: [] }));
    return x;
  };
  for (const r of data.rows) {
    const x = get(r.user_id);
    if (!x.guides.has(r.guide_id)) x.parts += partsOf.get(r.guide_id) ?? 0;
    x.guides.add(r.guide_id);
    x.done += Object.values(r.progress.done ?? {}).filter(Boolean).length;
    if (r.progress.exam?.date) x.exams.push(`${markOf.get(r.guide_id) ?? "?"} ${r.progress.exam.date}`);
  }
  for (const t of data.time.rows) {
    const x = get(t.user_id);
    if (!x.guides.has(t.guide_id)) {
      x.guides.add(t.guide_id);
      x.parts += partsOf.get(t.guide_id) ?? 0;
    }
    x.seconds += Number(t.seconds) || 0;
    if (t.day > x.last) x.last = t.day;
  }
  const users = data.users.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  // Guide requests from the study list ("Need a guide for another course?"), grouped by their text.
  const wanted = new Map<string, { title: string; n: number }>();
  for (const p of data.packs) {
    const k = p.title.trim().toLowerCase().replace(/\s+/g, " ");
    if (!k) continue;
    const w = wanted.get(k) ?? { title: p.title.trim(), n: 0 };
    w.n++;
    wanted.set(k, w);
  }
  const requests = [...wanted.values()].sort((a, b) => b.n - a.n).slice(0, 15);

  return (
    <>
      <header className="ad-head">
        <div>
          <h1>Students</h1>
          <p>{users.length} accounts · newest first</p>
        </div>
        <div className="ad-tools">
          <Link href={showEmails ? "/app/admin/students" : "/app/admin/students?emails=1"} className="ad-btn">
            {showEmails ? "Hide emails" : "Show emails"}
          </Link>
        </div>
      </header>
      {showEmails && (
        <p className="ad-note">
          <b>Confidential.</b> Emails are visible. Do not share this page or copy the list anywhere else.
        </p>
      )}

      <section className="ad-card" aria-label="All accounts">
        <div className="ad-scroll">
          <table className="ad-table" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Signed up</th>
                <th scope="col">Last sign-in</th>
                <th scope="col">Guides</th>
                <th scope="col" className="r">
                  Parts done
                </th>
                <th scope="col" className="r">
                  Study time
                </th>
                <th scope="col">Last studied</th>
                <th scope="col">Exam dates</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const x = per.get(u.id);
                return (
                  <tr key={u.id}>
                    <td className={showEmails ? undefined : "who"} style={showEmails ? { wordBreak: "break-all" } : undefined}>
                      {showEmails ? u.email : studentLabel(u.id)}
                    </td>
                    <td>{when(u.created_at)}</td>
                    <td>{when(u.last_sign_in_at)}</td>
                    <td>{x ? [...x.guides].map((g) => markOf.get(g) ?? "?").join(", ") : "–"}</td>
                    <td className="r">{x ? `${x.done}/${x.parts}` : "–"}</td>
                    <td className="r">{formatDuration(x?.seconds ?? 0)}</td>
                    <td>{onDay(x?.last)}</td>
                    <td>{x?.exams.length ? x.exams.join(" · ") : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ad-card" aria-labelledby="requests">
        <div>
          <h2 id="requests">Guides students ask for</h2>
          <span className="ad-sub">From the study list, grouped by the course name students typed</span>
        </div>
        {requests.length ? (
          <ol className="ad-funnel">
            {requests.map((r) => (
              <li key={r.title}>
                <div className="ad-funnel-top">
                  <span>{r.title}</span>
                  <span>
                    <b>{r.n}</b>
                  </span>
                </div>
                <div className="ad-bar" aria-hidden="true">
                  <i style={{ width: `${(100 * r.n) / requests[0].n}%` }} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ad-empty">No requests yet.</p>
        )}
      </section>
    </>
  );
}

export default function AdminStudentsPage({ searchParams }: PageProps<"/app/admin/students">) {
  return (
    <Suspense fallback={<p className="ad-loading">Loading the students…</p>}>
      <StudentsView searchParams={searchParams} />
    </Suspense>
  );
}
