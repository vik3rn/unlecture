import Link from "next/link";
import type { Attention, Overview } from "@/lib/admin-metrics";
import { formatDuration } from "@/lib/guide-time";

// What the admin overview shows, from numbers already computed (lib/admin-metrics.ts). No data access here, so the
// layout can be checked with sample numbers.
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const shortDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDay = (d: string) => shortDay.format(new Date(`${d}T00:00:00Z`));
function fmtSpan(a: string, b: string) {
  const [x, y] = [fmtDay(a), fmtDay(b)];
  const [dx, mx] = x.split(" ");
  const [dy, my] = y.split(" ");
  return mx === my ? `${dx}–${dy} ${my}` : `${x} – ${y}`;
}
// Study time on a tile: whole hours from 10 h up, so the number fits on one line.
const tileTime = (s: number) => (s >= 36_000 ? `${Math.round(s / 3600)} h` : formatDuration(s));
const pct = (x: number | null) => (x === null ? "–" : `${Math.round(100 * x)} %`);

function Arrow({ dir }: { dir: "up" | "down" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "up" ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7"} />
    </svg>
  );
}

// The change against the previous period. Small bases show the absolute change, larger ones the percentage.
function Delta({ now, prev, kind }: { now: number; prev: number; kind: "count" | "points" | "time" }) {
  const diff = now - prev;
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  let text: string;
  if (kind === "points") text = `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(Math.round(100 * diff))} pts`;
  else if (kind === "time") text = diff === 0 ? "±0" : `${diff > 0 ? "+" : "−"}${formatDuration(Math.abs(diff))}`;
  else if (prev >= 30) text = `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(Math.round((100 * diff) / prev))} %`;
  else text = `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(diff)}`;
  return (
    <span className={`ad-pill ${dir}`}>
      {dir !== "flat" && <Arrow dir={dir} />}
      {text}
    </span>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values
    .map((v, i) => `${((i * 120) / (values.length - 1)).toFixed(1)},${(max === min ? 16 : 30 - ((v - min) * 28) / (max - min)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="88" height="30" viewBox="-4 -4 128 40" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#2c5bd1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Active students per day, last 30 days, with the 30 days before as a dashed line. Today is still running, so its
// segment is dotted.
function DailyChart({ daily }: { daily: Overview["daily"] }) {
  const L = 40;
  const T = 14;
  const W = 740;
  const H = 198;
  const top = Math.max(4, ...daily.cur, ...daily.prev);
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => top / s <= 4) ?? 1000;
  const max = Math.ceil(top / step) * step;
  const x = (i: number) => L + (i * W) / 29;
  const y = (v: number) => T + H - (v * H) / max;
  const line = (vs: number[]) => vs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const peak = daily.cur.reduce((b, v, i) => (v > daily.cur[b] ? i : b), 0);
  const total = daily.cur.reduce((s, v) => s + v, 0);
  const labels = [0, 7, 14, 21, 29];
  return (
    <svg
      viewBox="0 0 800 240"
      className="ad-chart"
      role="img"
      aria-label={`Active students per day over the last 30 days, peaking at ${daily.cur[peak]} on ${fmtDay(daily.days[peak])}; today so far ${daily.cur[29]}.`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={L + W} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#c9d0e0" : "#e9edf5"} />
          <text x={L - 10} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#6a7090">
            {t}
          </text>
        </g>
      ))}
      <polyline points={line(daily.prev)} fill="none" stroke="#8a93ad" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
      <polygon points={`${x(0)},${y(0)} ${line(daily.cur)} ${x(29)},${y(0)}`} fill="#2c5bd1" fillOpacity="0.07" />
      <polyline points={line(daily.cur.slice(0, 29))} fill="none" stroke="#2c5bd1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline
        points={`${x(28).toFixed(1)},${y(daily.cur[28]).toFixed(1)} ${x(29).toFixed(1)},${y(daily.cur[29]).toFixed(1)}`}
        fill="none"
        stroke="#2c5bd1"
        strokeWidth="2.5"
        strokeDasharray="2 4"
        strokeLinecap="round"
      />
      {total > 0 && (
        <>
          <circle cx={x(peak)} cy={y(daily.cur[peak])} r="5" fill="#2c5bd1" stroke="#ffffff" strokeWidth="2" />
          <text
            x={peak > 22 ? x(peak) - 8 : x(peak) + 8}
            y={Math.max(12, y(daily.cur[peak]) - 8)}
            textAnchor={peak > 22 ? "end" : "start"}
            fontSize="12"
            fontWeight="700"
            fill="#14183a"
          >
            {daily.cur[peak]} · {fmtDay(daily.days[peak])}
          </text>
        </>
      )}
      {labels.map((i) => (
        <text key={i} x={x(i)} y="234" textAnchor={i === 0 ? "start" : i === 29 ? "end" : "middle"} fontSize="12" fill="#6a7090">
          {i === 29 ? "Today" : fmtDay(daily.days[i])}
        </text>
      ))}
    </svg>
  );
}

function AttentionIcon({ tone }: { tone: Attention["tone"] }) {
  const stroke = tone === "critical" ? "#b8322a" : tone === "warning" ? "#a86200" : "#14183a";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tone === "critical" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 17h.01" />
        </>
      ) : tone === "warning" ? (
        <>
          <path d="M12 3l9.5 17h-19z" />
          <path d="M12 10v4M12 17h.01" />
        </>
      ) : (
        <path d="M3 17l6-6 4 4 8-8M14 7h7v7" />
      )}
    </svg>
  );
}

function shade(share: number) {
  return share >= 0.75 ? "s4" : share >= 0.45 ? "s3" : share >= 0.25 ? "s2" : "s1";
}

export function OverviewBody({
  o,
  range,
  updatedAt,
  timeMissing,
  timeError,
}: {
  o: Overview;
  range: number;
  updatedAt: Date;
  timeMissing: boolean;
  timeError: string | null;
}) {
  const vs = `vs ${fmtSpan(o.period.prevFrom, o.period.prevTo)}`;
  const steps = o.funnel.map((s, i) => ({ ...s, step: i && o.funnel[i - 1].n ? s.n / o.funnel[i - 1].n : null }));
  const weakest = steps.slice(1).reduce<number | null>((w, s, i) => {
    if (s.step === null) return w;
    return w === null || s.step < (steps[w].step ?? 1) ? i + 1 : w;
  }, null);
  const total = o.funnel[0].n;

  return (
    <>
      <header className="ad-head">
        <div>
          <h1>Overview</h1>
          <p>
            {fmtSpan(o.period.from, o.period.to)} · updated {clock.format(updatedAt)}, Madrid time
          </p>
        </div>
        <div className="ad-tools">
          <nav className="ad-seg" aria-label="Period">
            <Link href="/app/admin?range=7" aria-current={range === 7 ? "true" : undefined}>
              Last 7 days
            </Link>
            <Link href="/app/admin?range=30" aria-current={range === 30 ? "true" : undefined}>
              Last 30 days
            </Link>
          </nav>
          <span className="ad-compare">Compared with {fmtSpan(o.period.prevFrom, o.period.prevTo)}</span>
        </div>
      </header>

      {timeMissing && (
        <p className="ad-note">
          Run <code>supabase/migrations/0004_guide_time.sql</code> to start measuring study time.
        </p>
      )}
      {timeError && (
        <p role="alert" className="ad-error">
          Could not load study time: {timeError}
        </p>
      )}

      <ul className="ad-kpis" aria-label="Key numbers">
        <li className="ad-kpi">
          <span className="ad-kpi-label">Active students</span>
          <div className="ad-kpi-value">
            <b>{o.active.now}</b>
            <Spark values={o.spark.active} />
          </div>
          <span className="ad-kpi-delta">
            {o.comparable ? (
              <>
                <Delta now={o.active.now} prev={o.active.prev} kind="count" />
                {vs}
              </>
            ) : (
              "No comparison yet"
            )}
          </span>
          <span className="ad-kpi-def">Studied or saved progress in the period</span>
        </li>
        <li className="ad-kpi">
          <span className="ad-kpi-label">New sign-ups</span>
          <div className="ad-kpi-value">
            <b>{o.signups.now}</b>
            <Spark values={o.spark.signups} />
          </div>
          <span className="ad-kpi-delta">
            <Delta now={o.signups.now} prev={o.signups.prev} kind="count" />
            {vs}
          </span>
          <span className="ad-kpi-def">Accounts created in the period</span>
        </li>
        <li className="ad-kpi">
          <span className="ad-kpi-label">Activation</span>
          <div className="ad-kpi-value">
            <b>{pct(o.activation.rate)}</b>
          </div>
          <span className="ad-kpi-delta">of {o.activation.n} new accounts</span>
          <span className="ad-kpi-def">New accounts that have finished a part</span>
        </li>
        <li className="ad-kpi">
          <span className="ad-kpi-label">Came back</span>
          <div className="ad-kpi-value">
            <b>{pct(o.returning.now)}</b>
          </div>
          <span className="ad-kpi-delta">
            {o.comparable && o.returning.now !== null && o.returning.prev !== null && (
              <Delta now={o.returning.now} prev={o.returning.prev} kind="points" />
            )}
            of {o.returning.n} active
          </span>
          <span className="ad-kpi-def">Active students who studied on 2 or more days</span>
        </li>
        <li className="ad-kpi">
          <span className="ad-kpi-label">Study time</span>
          <div className="ad-kpi-value">
            <b>{tileTime(o.study.now)}</b>
            <Spark values={o.spark.seconds} />
          </div>
          <span className="ad-kpi-delta">
            {o.comparable ? (
              <>
                <Delta now={o.study.now} prev={o.study.prev} kind="time" />
                {vs}
              </>
            ) : (
              "No comparison yet"
            )}
          </span>
          <span className="ad-kpi-def">Median {formatDuration(o.study.median)} per student who studied</span>
        </li>
      </ul>

      <div className="ad-row">
        <section className="ad-card wide" aria-labelledby="dau">
          <div className="ad-card-head">
            <h2 id="dau">Active students per day</h2>
            <span className="ad-legend">
              <span>
                <svg width="22" height="8" aria-hidden="true">
                  <line x1="0" y1="4" x2="22" y2="4" stroke="#2c5bd1" strokeWidth="2.5" />
                </svg>
                Last 30 days
              </span>
              <span>
                <svg width="22" height="8" aria-hidden="true">
                  <line x1="0" y1="4" x2="22" y2="4" stroke="#8a93ad" strokeWidth="2" strokeDasharray="4 3" />
                </svg>
                30 days before
              </span>
            </span>
          </div>
          <DailyChart daily={o.daily} />
          {o.trackingFrom && o.trackingFrom > o.daily.days[0] && (
            <span className="ad-sub">
              Study days are tracked from {fmtDay(o.trackingFrom)}. Before that, only the day a student last saved progress
              counts.
            </span>
          )}
        </section>

        <section className="ad-card side" aria-labelledby="attention">
          <h2 id="attention">Needs attention</h2>
          {o.attention.length ? (
            <ul className="ad-att">
              {o.attention.map((a) => (
                <li key={a.title} className={a.tone}>
                  <Link href={a.href}>
                    <AttentionIcon tone={a.tone} />
                    <span>
                      <b>{a.title}</b>
                      <small>{a.detail}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ad-empty">Nothing needs attention right now.</p>
          )}
        </section>
      </div>

      <div className="ad-row">
        <section className="ad-card half" aria-labelledby="funnel">
          <div className="ad-card-head">
            <h2 id="funnel">From sign-up to mock exam</h2>
            <span>All {total} accounts</span>
          </div>
          <ol className="ad-funnel">
            {steps.map((s, i) => (
              <li key={s.label}>
                <div className="ad-funnel-top">
                  <span>{s.label}</span>
                  <span>
                    <b>{s.n}</b> · {total ? Math.round((100 * s.n) / total) : 0} %
                    {s.step !== null && ` · ${Math.round(100 * s.step)} % of the step before`}
                  </span>
                </div>
                <div className={i === weakest ? "ad-bar weak" : "ad-bar"} aria-hidden="true">
                  <i style={{ width: `${total ? (100 * s.n) / total : 0}%` }} />
                </div>
                {i === weakest && <small>Weakest step</small>}
              </li>
            ))}
          </ol>
        </section>

        <section className="ad-card half" aria-labelledby="cohorts">
          <div>
            <h2 id="cohorts">Do students come back?</h2>
            <span className="ad-sub">Share of each sign-up week that was active in that week and the weeks after</span>
          </div>
          {o.cohorts.some((c) => c.size > 0) ? (
            <div className="ad-scroll">
              <table className="ad-cohort">
                <thead>
                  <tr>
                    <th scope="col">Signed up</th>
                    <th scope="col">Students</th>
                    <th scope="col">Week 0</th>
                    <th scope="col">Week 1</th>
                    <th scope="col">Week 2</th>
                    <th scope="col">Week 3</th>
                  </tr>
                </thead>
                <tbody>
                  {o.cohorts.map((c) => (
                    <tr key={c.week}>
                      <td>Week of {fmtDay(c.week)}</td>
                      <td>{c.size}</td>
                      {c.cells.map((cell, k) =>
                        cell ? (
                          <td key={k} className={`c ${shade(cell.share)}`}>
                            {Math.round(100 * cell.share)} %{cell.running ? "*" : ""}
                          </td>
                        ) : (
                          <td key={k} />
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ad-empty">No sign-ups in the last four weeks.</p>
          )}
          <span className="ad-sub">
            * week still running. Darker = more students came back.
            {o.trackingFrom && ` Blank = before study days were tracked (from ${fmtDay(o.trackingFrom)}).`}
          </span>
        </section>
      </div>

      <section aria-labelledby="guides">
        <div className="ad-card-head" style={{ marginBottom: 10 }}>
          <h2 id="guides" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            Guides
          </h2>
          <Link href="/app/admin/guides" className="ad-btn">
            Guides and questions
          </Link>
        </div>
        <div className="ad-guides">
          {o.guides.map((g, i) => (
            <article key={g.id} className="ad-card" aria-labelledby={`g-${g.slug}`}>
              <div className="ad-guide-head">
                <span className={i % 2 ? "ad-mark warm" : "ad-mark"} aria-hidden="true">
                  {g.mark}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h3 id={`g-${g.slug}`}>{g.title}</h3>
                  <span className="ad-sub">
                    {g.students} students · {g.active} active · {pct(g.finishedAll)} finished every part
                  </span>
                </div>
              </div>
              <div
                className="ad-parts"
                role="img"
                aria-label={`Share of students who finished each part: ${g.parts.map((p, k) => `part ${g.partNumbers[k]} ${Math.round(100 * p)} %`).join(", ")}.`}
              >
                {g.parts.map((p, k) => (
                  <i
                    key={g.partNumbers[k]}
                    className={g.drop?.part === g.partNumbers[k] ? "drop" : undefined}
                    style={{ height: `${Math.max(2, Math.round(100 * p))}%` }}
                    title={`Part ${g.partNumbers[k]}: ${Math.round(100 * p)} %`}
                  />
                ))}
              </div>
              <span className="ad-sub">
                {g.drop ? (
                  <>
                    Biggest drop at <b>Part {g.drop.part}</b> (−{g.drop.pts} pts) ·{" "}
                  </>
                ) : null}
                Quiz answers fully right {pct(g.accuracy)}
                {g.mockBest !== null && ` · mock best ${pct(g.mockBest)}`}
              </span>
            </article>
          ))}
          {o.guides.length === 0 && <p className="ad-empty">No guides yet.</p>}
        </div>
      </section>
    </>
  );
}
