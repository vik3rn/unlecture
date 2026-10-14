"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { plain, type GuideFormat, type GuideMock, type MockMcq, type MockOpen } from "@/lib/guides";
import type { MockState } from "@/lib/progress";
import {
  bestScore,
  choicePoints,
  choiceStatus,
  clock,
  fmtPoints,
  mockDeadline,
  mockKey,
  pct,
  pickOfText,
  recordScore,
  scoreMock,
  scoringRule,
  type QuestionResult,
} from "@/lib/scoring";
import { AnswerBox, ChoiceOptions, ModelAnswer, SelfGrade, STATUS_CLASS, statusText, useDraft } from "./answers";
import { saveFailed, saveLabel, useGuide } from "./progress";
import { Html } from "./ui";

// A timed mock exam: rules → the exam with a countdown from the saved start time (a reload continues the same
// attempt; answers autosave) → submit, or automatic submit when the time is up → the result with every answer
// explained, self-grading of the open questions and a breakdown by topic. Retake starts a new attempt; the score
// of every attempt stays in the history, so the best and the last score are kept.

type Walkthrough = { n: number; title: string } | null;

// One clock tick per second, only while the timer is on screen; null on the server so the first render matches.
const subscribeSecond = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};
const secondNow = () => Math.floor(Date.now() / 1000) * 1000;
const noTime = () => null;

const pointsWord = (x: number) => `${fmtPoints(x)} ${x === 1 ? "point" : "points"}`;

// What screen readers hear: a polite note every ten minutes, then at 10, 5 and 1 minute left. Never every second.
function timeNote(left: number) {
  const min = Math.ceil(left / 60_000);
  if (left <= 0) return "Time is up. Your exam was submitted.";
  if (min <= 1) return "1 minute left.";
  if (min <= 5) return "5 minutes left.";
  if (min <= 10) return "10 minutes left.";
  return `${Math.ceil(min / 10) * 10} minutes left.`;
}

function Timer({ deadline, onExpire }: { deadline: number; onExpire: () => void }) {
  const now = useSyncExternalStore(subscribeSecond, secondNow, noTime);
  const left = now === null ? null : deadline - now;
  const expired = left !== null && left <= 0;
  useEffect(() => {
    if (expired) onExpire();
  }, [expired, onExpire]);
  return (
    <span className={`timer${left !== null && left < 5 * 60_000 ? " low" : ""}`}>
      <span className="tl">Time left</span>{" "}
      <span role="timer" className="clock">
        {left === null ? "--:--" : clock(left)}
      </span>
      <span className="sr-only" role="status">
        {left === null ? "" : timeNote(left)}
      </span>
    </span>
  );
}

export function MockExam({
  mock,
  format,
  walkthrough,
  brand,
}: {
  mock: GuideMock;
  format: GuideFormat;
  walkthrough: Walkthrough;
  brand: string;
}) {
  const { base, progress, update, saveState } = useGuide();
  const state = progress.mocks?.[mock.id] ?? null;
  const [rulesAgain, setRulesAgain] = useState(false); // "Retake": show the rules before the new attempt starts
  const [asking, setAsking] = useState(false); // "Submit now?" shown under the questions
  const yes = useRef<HTMLButtonElement>(null);
  const view = !state || rulesAgain ? "start" : state.submittedAt === null ? "exam" : "result";

  // Move focus to the new screen's heading when the screen changes (not on the first render).
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(view);
  useEffect(() => {
    if (shown.current === view) return;
    shown.current = view;
    window.scrollTo({ top: 0 });
    heading.current?.focus();
  }, [view]);

  const setMock = useCallback(
    (fn: (s: MockState) => MockState) =>
      update((p) => {
        const s = p.mocks?.[mock.id];
        if (!s) return p;
        const next = fn(s);
        return next === s ? p : { ...p, mocks: { ...p.mocks, [mock.id]: next } };
      }),
    [update, mock.id],
  );

  const start = () => {
    const startedAt = Date.now();
    update((p) => ({
      ...p,
      mocks: {
        ...p.mocks,
        [mock.id]: { id: mock.id, startedAt, submittedAt: null, answers: {}, grades: {}, history: p.mocks?.[mock.id]?.history ?? [] },
      },
    }));
    setRulesAgain(false);
  };

  // Submits once, at the deadline at the latest. The score goes into the history now and is updated as the open
  // questions are graded.
  const submit = useCallback(
    (at: number) =>
      setMock((s) => {
        if (s.submittedAt !== null) return s;
        const submittedAt = Math.max(s.startedAt, Math.min(at, mockDeadline(s.startedAt, mock.minutes)));
        const r = scoreMock(mock, format, s);
        return { ...s, submittedAt, history: recordScore(s.history, { score: r.total, max: r.max, at: submittedAt }) };
      }),
    [setMock, mock, format],
  );
  const deadline = state ? mockDeadline(state.startedAt, mock.minutes) : 0;
  const expire = useCallback(() => submit(deadline), [submit, deadline]);

  const setAnswer = useCallback(
    (key: string, value: string) =>
      setMock((s) => {
        if (s.submittedAt !== null || Date.now() > mockDeadline(s.startedAt, mock.minutes)) return s;
        const answers = { ...s.answers };
        if (value.trim()) answers[key] = value;
        else delete answers[key];
        return { ...s, answers };
      }),
    [setMock, mock.minutes],
  );

  const setGrade = (key: string, g: number) =>
    setMock((s) => {
      if (s.submittedAt === null) return s;
      const grades = { ...s.grades, [key]: g };
      const r = scoreMock(mock, format, { answers: s.answers, grades });
      return { ...s, grades, history: recordScore(s.history, { score: r.total, max: r.max, at: s.submittedAt }) };
    });

  const answered = state ? mock.questions.filter((_, i) => !!state.answers[mockKey(i)]).length : 0;
  const unanswered = mock.questions.length - answered;
  // Submit asks first, on the page (no browser dialog): the question moves into view and gets focus.
  const confirmSubmit = () => setAsking(true);
  useEffect(() => {
    if (!asking) return;
    yes.current?.scrollIntoView({ block: "center" });
    yes.current?.focus();
  }, [asking]);

  const best = state ? bestScore(state.history) : null;
  const last = state?.history.at(-1) ?? null;
  const tries = state?.history.length ?? 0;
  const history =
    best && last ? (
      <p className="history">
        Best {fmtPoints(best.score)}/{fmtPoints(best.max)} ({pct(best.score, best.max)} %) · last {fmtPoints(last.score)}/
        {fmtPoints(last.max)} ({pct(last.score, last.max)} %) · {tries} {tries === 1 ? "attempt" : "attempts"}
      </p>
    ) : null;

  const bar = (
    <header className="bar">
      <Link href={base} className="back">
        ← Course
      </Link>
      <span className="crumb">
        <span className="brand">{brand}</span>
        <span className="pos">Mock exam</span>
      </span>
      {view === "exam" && state ? (
        <>
          <Timer deadline={deadline} onExpire={expire} />
          <span className="answered">
            {answered}/{mock.questions.length}
            <span className="sr-only"> answered</span>
          </span>
          <button type="button" className="btn" onClick={confirmSubmit}>
            Submit
          </button>
        </>
      ) : (
        <span className="spacer" />
      )}
      <span className={`save${saveFailed(saveState) ? " err" : ""}`}>{saveLabel[saveState]}</span>
      <span className="sr-only" role="alert">
        {saveFailed(saveState) ? saveLabel[saveState] : ""}
      </span>
    </header>
  );

  if (view === "start") {
    return (
      <div className="dg">
        {bar}
        <main id="main" className="page">
          <p className="eyebrow">Mock exam</p>
          <h1 ref={heading} tabIndex={-1}>
            <Html html={mock.title} />
          </h1>
          {mock.intro && <Html html={mock.intro} block className="lede" />}
          <section className="card-x rules" aria-labelledby="rules">
            <h2 id="rules">Before you start</h2>
            <ul>
              <li>
                <b>{mock.minutes} minutes</b>, timed. The clock starts when you press Start and keeps running if you
                leave or reload the page.
              </li>
              <li>
                <b>{mock.size.mcq} multiple-choice questions</b> ({format.label || pickOfText(format)})
                {mock.size.open > 0 && (
                  <>
                    {" "}
                    and <b>{mock.size.open} open questions</b>
                  </>
                )}
                , {pointsWord(mock.size.points)} in total.
              </li>
              <li>
                Scoring: {scoringRule(format)}.
                {mock.size.open > 0 &&
                  " After you submit, you grade your open answers against the model answer: 0, ½ or full points."}
              </li>
              <li>
                <b>No feedback until you submit.</b> Then you see your score, every answer explained and a breakdown
                by topic.
              </li>
              <li>Your answers save automatically. When the time is up, the exam is submitted for you.</li>
            </ul>
          </section>
          {mock.pdf && (
            <p className="pdf">
              <a href={mock.pdf} target="_blank" rel="noopener noreferrer">
                Prefer paper? Open the PDF version
              </a>
            </p>
          )}
          {history}
          {tries > 0 && (
            <p className="history">Starting replaces the answers of your last attempt. Its score stays in your history.</p>
          )}
          <div className="finish">
            <button type="button" className="cta" onClick={start}>
              {tries > 0 ? "Start a new attempt" : `Start the ${mock.minutes}-minute mock`}
            </button>
            {rulesAgain && (
              <button type="button" className="btn ghost" onClick={() => setRulesAgain(false)}>
                Back to your result
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (view === "exam" && state) {
    return (
      <div className="dg">
        {bar}
        <main id="main" className="page">
          <p className="eyebrow">Mock exam · in progress</p>
          <h1 ref={heading} tabIndex={-1}>
            <Html html={mock.title} />
          </h1>
          <p className="meta">
            {mock.minutes} minutes · {scoringRule(format)} · no feedback until you submit · answers save automatically
          </p>
          <ol className="exam-qs">
            {mock.questions.map((q, i) => {
              const key = mockKey(i);
              return (
                <li key={key}>
                  {q.kind === "mcq" ? (
                    <ExamChoice
                      id={`${mock.id}-${key}`}
                      i={i}
                      q={q}
                      format={format}
                      value={state.answers[key] ?? ""}
                      onChange={(v) => setAnswer(key, v)}
                    />
                  ) : (
                    <ExamOpen
                      id={`${mock.id}-${key}`}
                      i={i}
                      q={q}
                      value={state.answers[key] ?? ""}
                      onChange={(v) => setAnswer(key, v)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {asking ? (
            <div className="finish confirm" role="group" aria-labelledby="confirm-q">
              <p id="confirm-q">
                <b>Submit now?</b>{" "}
                {unanswered > 0
                  ? `${unanswered} of ${mock.questions.length} questions ${unanswered === 1 ? "has" : "have"} no answer.`
                  : "Every question has an answer."}{" "}
                You cannot change your answers after you submit.
              </p>
              <button
                ref={yes}
                type="button"
                className="cta"
                onClick={() => {
                  setAsking(false);
                  submit(Date.now());
                }}
              >
                Yes, submit
              </button>
              <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
                Keep working
              </button>
            </div>
          ) : (
            <div className="finish">
              <button type="button" className="cta" onClick={confirmSubmit}>
                Submit the exam
              </button>
              <span className="hint">
                {answered} of {mock.questions.length} answered
              </span>
            </div>
          )}
        </main>
      </div>
    );
  }

  // The result.
  const r = state ? scoreMock(mock, format, state) : null;
  if (!state || !r) return null;
  return (
    <div className="dg">
      {bar}
      <main id="main" className="page">
        <p className="eyebrow">Mock exam · your result</p>
        <h1 ref={heading} tabIndex={-1}>
          <Html html={mock.title} />
        </h1>

        <section className="progress-card result" aria-label="Your score">
          <div className="pc-top">
            <div>
              <p className="pc-label">{r.open.ungraded > 0 ? "Your score so far" : "Your score"}</p>
              <p className="pc-num">
                {fmtPoints(r.total)} / {fmtPoints(r.max)} points{" "}
                <span className="pc-pct">({pct(r.total, r.max)} %)</span>
              </p>
              <p className="pc-sub">
                Multiple choice {fmtPoints(r.mcq.points)}/{fmtPoints(r.mcq.max)}: {r.mcq.right} right · {r.mcq.wrong}{" "}
                wrong{r.mcq.partial > 0 && ` · ${r.mcq.partial} partly right`} · {r.mcq.blank} blank
                {r.open.max > 0 && ` · Open ${fmtPoints(r.open.points)}/${fmtPoints(r.open.max)}`}
              </p>
              {history}
            </div>
            <div className="result-actions">
              <button type="button" className="cta" onClick={() => setRulesAgain(true)}>
                Retake
              </button>
              <Link href={base} className="btn ghost">
                Back to the course
              </Link>
            </div>
          </div>
          <span
            className="meter big"
            role="progressbar"
            aria-label="Score"
            aria-valuenow={Math.max(0, pct(r.total, r.max))}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${Math.max(0, Math.min(100, pct(r.total, r.max)))}%` }} />
          </span>
        </section>

        {r.open.ungraded > 0 && (
          <p className="note">
            Grade your {r.open.ungraded} open {r.open.ungraded === 1 ? "answer" : "answers"} below against the model
            answer to complete your score.
          </p>
        )}
        {walkthrough && (
          <p className="note plain">
            Walkthrough of this mock:{" "}
            <Link href={`${base}/${walkthrough.n}`}>
              Part {walkthrough.n} · {plain(walkthrough.title)}
            </Link>
          </p>
        )}

        {r.topics.length > 1 && (
          <section className="sec" aria-labelledby="by-topic">
            <h2 id="by-topic">By topic</h2>
            <div className="topics-wrap">
              <table className="topics">
                <thead>
                  <tr>
                    <th scope="col">Topic</th>
                    <th scope="col">Questions</th>
                    <th scope="col">Points</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {r.topics.map((t) => (
                    <tr key={t.topic}>
                      <th scope="row">{t.topic}</th>
                      <td>{t.count}</td>
                      <td>
                        {fmtPoints(t.points)} / {fmtPoints(t.max)}
                      </td>
                      <td>
                        <span className="share">
                          <span className="meter" aria-hidden="true">
                            <i style={{ width: `${Math.max(0, Math.min(100, pct(t.points, t.max)))}%` }} />
                          </span>
                          {pct(t.points, t.max)} %
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="sec" aria-labelledby="review">
          <h2 id="review">
            Review <span className="cnt">every question with the answer explained</span>
          </h2>
          <ol className="exam-qs">
            {mock.questions.map((q, i) => {
              const key = mockKey(i);
              const res = r.questions[i];
              return (
                <li key={key}>
                  {q.kind === "mcq" ? (
                    <ReviewChoice id={`${mock.id}-${key}-r`} i={i} q={q} format={format} answer={state.answers[key] ?? ""} />
                  ) : (
                    <ReviewOpen
                      id={`${mock.id}-${key}-r`}
                      i={i}
                      q={q}
                      res={res}
                      answer={state.answers[key] ?? ""}
                      grade={state.grades[key]}
                      onGrade={(g) => setGrade(key, g)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <div className="finish">
          <button type="button" className="cta" onClick={() => setRulesAgain(true)}>
            Retake this mock
          </button>
          <Link href={base} className="btn ghost">
            Back to the course
          </Link>
        </div>
      </main>
    </div>
  );
}

function QuestionHead({ i, points, topic, status }: { i: number; points: number; topic?: string; status?: React.ReactNode }) {
  return (
    <div className="qh">
      <span className="qn">Question {i + 1}</span>
      {topic && <span className="topic">{topic}</span>}
      {status}
      <span className="pts">{pointsWord(points)}</span>
    </div>
  );
}

function ExamChoice({
  id,
  i,
  q,
  format,
  value,
  onChange,
}: {
  id: string;
  i: number;
  q: MockMcq;
  format: GuideFormat;
  value: string;
  onChange: (v: string) => void;
}) {
  const stemId = `${id}-stem`;
  return (
    <div className="q exam-q">
      <QuestionHead i={i} points={format.points} />
      {q.ctx && <Html html={q.ctx} block className="ctx" />}
      <Html id={stemId} html={q.stem} block className="stem" />
      <ChoiceOptions
        name={id}
        labelledBy={stemId}
        opts={q.opts}
        notes={q.notes}
        correct={q.correct}
        format={format}
        value={value}
        onChange={onChange}
        reveal={false}
      />
      {/* Always rendered, hidden while there is no answer, so picking an option does not move the page. */}
      <div className="qa">
        <button
          type="button"
          className="link-btn"
          onClick={() => onChange("")}
          style={{ visibility: value ? "visible" : "hidden" }}
        >
          Clear my answer{format.blank ? " (leave blank)" : ""}
        </button>
      </div>
    </div>
  );
}

function ExamOpen({
  id,
  i,
  q,
  value,
  onChange,
}: {
  id: string;
  i: number;
  q: MockOpen;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, change, flush] = useDraft(value, onChange);
  const stemId = `${id}-stem`;
  return (
    <div className="q exam-q open-q">
      <QuestionHead i={i} points={q.points} />
      {q.ctx && <Html html={q.ctx} block className="ctx" />}
      <Html id={stemId} html={q.stem} block className="stem" />
      <AnswerBox id={id} describedBy={stemId} lines={q.lines} value={draft} onChange={change} onBlur={flush} />
    </div>
  );
}

function ReviewChoice({
  id,
  i,
  q,
  format,
  answer,
}: {
  id: string;
  i: number;
  q: MockMcq;
  format: GuideFormat;
  answer: string;
}) {
  const stemId = `${id}-stem`;
  const pts = choicePoints(format, q.correct, answer);
  const status = choiceStatus(format, q.correct, answer);
  return (
    <div className="q checked exam-q">
      <QuestionHead i={i} points={format.points} topic={q.topic} />
      {q.ctx && <Html html={q.ctx} block className="ctx" />}
      <Html id={stemId} html={q.stem} block className="stem" />
      <ChoiceOptions
        name={id}
        labelledBy={stemId}
        opts={q.opts}
        notes={q.notes}
        correct={q.correct}
        format={format}
        value={answer}
        onChange={() => {}}
        reveal
      />
      <div className="qa">
        <span className={`score ${STATUS_CLASS[status]}`}>{statusText(status, pts, q.correct)}</span>
      </div>
      {q.expl && <Html html={q.expl} block className="expl" />}
    </div>
  );
}

function ReviewOpen({
  id,
  i,
  q,
  res,
  answer,
  grade,
  onGrade,
}: {
  id: string;
  i: number;
  q: MockOpen;
  res: QuestionResult;
  answer: string;
  grade: number | undefined;
  onGrade: (g: number) => void;
}) {
  const stemId = `${id}-stem`;
  const status =
    res.status === "blank" ? (
      <span className="score s0">No answer · 0</span>
    ) : res.status === "ungraded" ? (
      <span className="score s1">Not graded yet</span>
    ) : (
      <span className={`score ${grade === 1 ? "s2" : grade === 0.5 ? "s1" : "s0"}`}>
        Self-graded {fmtPoints(res.points)} of {fmtPoints(res.max)}
      </span>
    );
  return (
    <div className="q exam-q open-q">
      <QuestionHead i={i} points={q.points} topic={q.topic} status={status} />
      {q.ctx && <Html html={q.ctx} block className="ctx" />}
      <Html id={stemId} html={q.stem} block className="stem" />
      <p className="ml">Your answer</p>
      {answer.trim() ? <p className="mine">{answer}</p> : <p className="mine empty">You left this blank.</p>}
      <ModelAnswer model={q.model} rubric={q.rubric} />
      {answer.trim() && <SelfGrade name={`${id}-grade`} points={q.points} value={grade} onChange={onGrade} />}
    </div>
  );
}
