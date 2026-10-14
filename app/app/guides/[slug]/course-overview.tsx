"use client";

import Link from "next/link";
import type { GuideFormat, MockSummary, PartSummary } from "@/lib/guides";
import { plain } from "@/lib/guides";
import { fmtPoints, pickOfText, tallyPicks } from "@/lib/scoring";
import { ExamDate } from "./exam-date";
import { MockList } from "./mock-list";
import { EMPTY_PROGRESS, saveLabel, useGuide } from "./progress";
import { Html } from "./ui";

// "pick two of six" for the DAE guide; a guide with its own format shows its label instead.
const steps = (f: GuideFormat) =>
  [
    ["Watch", "Short video parts that play right here. Pause at every stop sign and solve on paper."],
    ["Remember", "The key points of each part, in a few lines."],
    [
      "Quiz",
      `Exam-style questions${f.label ? ` (${f.label})` : `: ${pickOfText(f)}`}, then check. Every option is explained.`,
    ],
    ["Paper", "Worked exercises to solve by hand, then open the answer."],
  ] as const;

export function CourseOverview({
  title,
  summary,
  facts,
  notOnSheet,
  examDay,
  credit,
  parts,
  format,
  mocks,
}: {
  title: string;
  summary: string;
  facts: string[];
  notOnSheet: string[];
  examDay: string[];
  credit: string;
  parts: PartSummary[];
  format: GuideFormat;
  mocks: MockSummary[];
}) {
  const { base, guest, progress, update, saveState } = useGuide();
  // One correct option: answers in progress.pick, scored in exam points. Otherwise pick-n answers in progress.quiz,
  // one mark per right pick (DAE).
  const single = format.correct === 1;
  const isAnswered = (key: string) => (single ? progress.pick?.[key] !== undefined : !!progress.quiz[key]);

  let total = 0;
  let answered = 0;
  let marks = 0;
  for (const p of parts) {
    for (const { key, correct } of p.qs) {
      total++;
      const picks = progress.quiz[key];
      if (!single && picks) {
        answered++;
        marks += picks.filter((x) => correct.includes(x)).length;
      }
    }
  }
  const tally = single ? tallyPicks(format, parts.flatMap((p) => p.qs), progress.pick) : null;
  if (tally) answered = tally.answered;
  const opens = parts.reduce((n, p) => n + p.opens.length, 0);
  const written = parts.reduce((n, p) => n + p.opens.filter((k) => progress.open?.[k]).length, 0);
  const done = parts.filter((p) => progress.done[p.n]).length;
  const pct = parts.length ? (100 * done) / parts.length : 0;
  const nextPart = parts.find((p) => !p.locked && !progress.done[p.n]) ?? parts.find((p) => !p.locked);

  const units: { unit: string; parts: PartSummary[] }[] = [];
  for (const p of parts) {
    if (units.at(-1)?.unit !== p.unit) units.push({ unit: p.unit, parts: [] });
    units.at(-1)!.parts.push(p);
  }

  const resetAll = () => {
    const what =
      opens > 0 || mocks.length > 0
        ? "Reset all quiz answers, open answers, mock exams and done marks in this guide?"
        : "Reset all quiz answers and done marks in this guide?";
    if (window.confirm(what)) update(() => EMPTY_PROGRESS);
  };

  return (
    <div className="dg">
      {guest && (
        <p className="guest">
          Free preview: nothing you do here is saved. <Link href="/signup">Sign up free</Link> to open every part and keep
          your progress.
        </p>
      )}
      <main id="main" className="page wide">
        <Link href={guest ? "/" : "/app"} className="up">
          {guest ? "← Home" : "← All guides"}
        </Link>

        <header className="course-head">
          <p className="eyebrow">Exam guide</p>
          <h1>{title}</h1>
          {summary && <p className="lede">{summary}</p>}
          <ExamDate />
          {facts.length > 0 && (
            <ul className="facts" aria-label="Exam facts">
              {facts.map((f) => (
                <li key={f}>
                  <Html html={f} className="chip" />
                </li>
              ))}
            </ul>
          )}
        </header>

        <section className="progress-card" aria-label="Your progress">
          <div className="pc-top">
            <div>
              <p className="pc-label">{guest ? "Preview" : "Your progress"}</p>
              <p className="pc-num">
                {done} of {parts.length} parts done
              </p>
              <p className="pc-sub">
                {answered}/{total} questions answered ·{" "}
                {tally ? `${fmtPoints(tally.points)}/${fmtPoints(tally.max)} points` : `${marks}/${answered * format.correct} marks`}
                {opens > 0 && ` · ${written}/${opens} open answers written`}
                {!guest && saveLabel[saveState] && <span className="pc-save"> · {saveLabel[saveState]}</span>}
              </p>
            </div>
            {nextPart && (
              <Link href={`${base}/${nextPart.n}`} className="cta">
                {done === 0 ? "Start" : "Continue"}: Part {nextPart.n} →
              </Link>
            )}
          </div>
          <span className="meter big" role="progressbar" aria-label="Parts done" aria-valuenow={done} aria-valuemin={0} aria-valuemax={parts.length}>
            <i style={{ width: `${pct}%` }} />
          </span>
        </section>

        <ol className="how" tabIndex={0} aria-label="How a guide works">
          {steps(format).map(([h, t], i) => (
            <li key={h}>
              <span className="num" aria-hidden="true">
                {i + 1}
              </span>
              <b>{h}</b>
              <span>{t}</span>
            </li>
          ))}
        </ol>

        {units.map((u) => (
          <section key={u.unit} className="unit" aria-label={plain(u.unit)}>
            <h2>
              <Html html={u.unit} />
            </h2>
            <ul className="parts">
              {u.parts.map((p) => {
                const isDone = !!progress.done[p.n];
                const answeredHere = p.qs.filter((q) => isAnswered(q.key)).length;
                const meta = [
                  p.dur,
                  p.chapters > 0 && `${p.chapters} chapters`,
                  p.qs.length > 0 && `${p.qs.length} ${p.qs.length === 1 ? "question" : "questions"}`,
                  p.opens.length > 0 && `${p.opens.length} open`,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const body = (
                  <>
                    <span className={`pn${isDone ? " done" : ""}`} aria-hidden="true">
                      {isDone ? "✓" : p.locked ? "🔒" : p.n}
                    </span>
                    <span className="pt">
                      <span className="t">
                        <span className="sr-only">Part {p.n}: </span>
                        <Html html={p.title} />
                      </span>
                      <span className="pm">{p.locked ? "Opens with a free account" : meta}</span>
                    </span>
                    <span className="ps">
                      {isDone ? (
                        <span className="badge done">Done</span>
                      ) : answeredHere > 0 ? (
                        <span className="badge">
                          {answeredHere}/{p.qs.length} answered
                        </span>
                      ) : null}
                      <span className="go" aria-hidden="true">
                        →
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={p.n}>
                    {p.locked ? (
                      <Link href="/signup" className="row locked">
                        {body}
                      </Link>
                    ) : (
                      <Link href={`${base}/${p.n}`} className="row">
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {mocks.length > 0 && <MockList mocks={mocks} format={format} />}

        {(notOnSheet.length > 0 || examDay.length > 0) && (
          <div className="extras">
            {notOnSheet.length > 0 && (
              <section className="card-x" aria-labelledby="not-on-sheet">
                <h2 id="not-on-sheet">Not on the formula sheet: learn it</h2>
                <ol>
                  {notOnSheet.map((x) => (
                    <li key={x}>
                      <Html html={x} />
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {examDay.length > 0 && (
              <section className="card-x" aria-labelledby="exam-day">
                <h2 id="exam-day">Exam day</h2>
                <ul>
                  {examDay.map((x) => (
                    <li key={x}>
                      <Html html={x} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <footer className="foot">
          {credit ? <Html html={credit} /> : <span />}
          {!guest && (
            <button type="button" className="link-btn" onClick={resetAll}>
              Reset my progress
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}
