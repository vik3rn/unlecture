"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LETTERS, mmss, type GuideFormat, type GuideOpen, type GuideQuestion } from "@/lib/guides";
import { LIMITS } from "@/lib/progress";
import {
  choicePoints,
  choiceStatus,
  fmtPoints,
  GRADES,
  gradeLabel,
  pointsWord,
  WORDS_PER_LINE,
  wordCount,
  type ChoiceStatus,
} from "@/lib/scoring";
import { Html } from "./ui";

// Building blocks for guides with an exam format: single-answer questions, open answers with a line limit, the
// model answer and the self-grade. Shared by the part pages and the mock exams.

export const STATUS_CLASS: Record<ChoiceStatus, string> = { right: "s2", partial: "s1", blank: "s1", wrong: "s0" };

// "Correct · +0.5", "Wrong · −0.125 · correct: B", "Blank · 0 · correct: B".
export function statusText(status: ChoiceStatus, points: number, correct: string[]) {
  const answer = `correct: ${correct.join(" and ")}`;
  if (status === "right") return `Correct · ${fmtPoints(points, true)}`;
  if (status === "blank") return `Blank · 0 · ${answer}`;
  return `${status === "partial" ? "Partly right" : "Wrong"} · ${fmtPoints(points, true)} · ${answer}`;
}

// The options as radio buttons (one correct option) or checkboxes (several), lettered A, B, C… `value` holds the
// picked letters ("B", "BE"; "" for none). With `reveal`, every option shows if it is right and its note; the
// inputs stay focusable so the feedback can be read, but they no longer change.
export function ChoiceOptions({
  name,
  labelledBy,
  opts,
  notes,
  correct,
  format,
  value,
  onChange,
  reveal,
  locked = false,
}: {
  name: string;
  labelledBy: string;
  opts: string[];
  notes: string[];
  correct: string[];
  format: GuideFormat;
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  locked?: boolean;
}) {
  const multi = format.correct > 1;
  const picks = value.split("").filter(Boolean);
  const frozen = reveal || locked;
  const pick = (letter: string) => {
    if (frozen) return;
    if (!multi) return onChange(letter);
    const next = picks.includes(letter)
      ? picks.filter((x) => x !== letter)
      : picks.length < format.correct
        ? [...picks, letter]
        : picks;
    onChange([...next].sort().join(""));
  };
  return (
    <div className="opts" role={multi ? "group" : "radiogroup"} aria-labelledby={labelledBy}>
      {opts.map((o, i) => {
        const letter = LETTERS[i];
        const picked = picks.includes(letter);
        const ok = correct.includes(letter);
        const cls = [
          "opt",
          picked && "sel",
          reveal && ok && "right",
          reveal && picked && !ok && "wrongpick",
          reveal && ok && !picked && "missed",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <label key={letter} className={cls}>
            <input
              type={multi ? "checkbox" : "radio"}
              name={name}
              value={letter}
              checked={picked}
              aria-disabled={frozen || undefined}
              onChange={() => pick(letter)}
            />
            <span className="l">{letter}</span>
            <span>
              <Html html={o} />
              {reveal && notes[i] && <Html html={notes[i]} className="nt" />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// A part quiz question when the exam has one correct option: pick one (or leave it blank), check, and see the
// points under the exam's rules with a note on every option.
export function SingleQuiz({
  id,
  q,
  label,
  format,
  answer,
  onCheck,
  onReset,
  onWatch,
  onNote = null,
}: {
  id: string;
  q: GuideQuestion;
  label: string;
  format: GuideFormat;
  answer: string | null; // null = not checked yet, "" = checked blank
  onCheck: (answer: string) => void;
  onReset: () => void;
  onWatch: (() => void) | null;
  onNote?: (() => void) | null; // opens the notes panel with this question chosen (logged in only)
}) {
  const [sel, setSel] = useState("");
  const checked = answer !== null;
  const status = checked ? choiceStatus(format, q.correct, answer) : null;
  const stemId = `${id}-stem`;
  return (
    <div className={`q${checked ? " checked" : ""}`}>
      <div className="qh">
        <span className={`src ${q.src}`}>{q.src === "video" ? "Video drill" : "New"}</span>
        {label}
        {onNote && (
          <button type="button" className="qn" onClick={onNote}>
            + Note on this question
          </button>
        )}
      </div>
      {q.ctx && <Html html={q.ctx} block className="ctx" />}
      <Html id={stemId} html={q.stem.replace(/^Q\d+\.\s*/, "")} block className="stem" />
      <ChoiceOptions
        name={id}
        labelledBy={stemId}
        opts={q.opts}
        notes={q.notes}
        correct={q.correct}
        format={format}
        value={checked ? answer : sel}
        onChange={setSel}
        reveal={checked}
      />
      <div className="qa">
        {checked ? (
          <button type="button" className="btn ghost" onClick={onReset}>
            Try again
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={sel.length !== format.correct}
              onClick={() => {
                onCheck(sel);
                setSel("");
              }}
            >
              Check
            </button>
            {format.blank && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  onCheck("");
                  setSel("");
                }}
              >
                Leave blank
              </button>
            )}
          </>
        )}
        <span role="status" className={`score ${status ? STATUS_CLASS[status] : ""}`}>
          {status && statusText(status, choicePoints(format, q.correct, answer), q.correct)}
        </span>
        {onWatch && (
          <button type="button" className="watch" onClick={onWatch}>
            ▶ Explained at {mmss(q.at ?? 0)} in the video
          </button>
        )}
      </div>
      {checked && q.expl && <Html html={q.expl} block className="expl" />}
    </div>
  );
}

// Typing stays in the component and reaches the progress half a second after the last key, on blur, when the tab
// is hidden or closed, and when the question leaves the page (also when navigation keeps the page hidden in
// <Activity>), so a long answer does not re-render the whole guide on every key. The progress saves a change made
// while the tab is hidden at once. A new text from elsewhere (another tab) arrives by remounting (progress `rev`).
export function useDraft(initial: string, commit: (text: string) => void) {
  const [draft, setDraft] = useState(initial);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current === null) return;
    const text = pending.current;
    pending.current = null;
    commitRef.current(text);
  }, []);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);
  const change = useCallback(
    (text: string) => {
      setDraft(text);
      pending.current = text;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
    },
    [flush],
  );
  return [draft, change, flush] as const;
}

// A text answer with the exam's line limit as a soft word counter (about 13 words per handwritten line). The
// counter is not a live region: it is read with the field, not on every key.
export function AnswerBox({
  id,
  label,
  describedBy,
  lines,
  value,
  onChange,
  onBlur,
  disabled = false,
}: {
  id: string;
  label: string; // the question it answers, for screen readers ("question 3"); shown as "Your answer"
  describedBy?: string;
  lines: number;
  value: string;
  onChange: (text: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}) {
  const words = wordCount(value);
  const limit = lines * WORDS_PER_LINE;
  const over = lines > 0 && words > limit;
  return (
    <div className="answer">
      <label htmlFor={`${id}-text`} className="al">
        Your answer<span className="sr-only"> to {label}</span>
      </label>
      <textarea
        id={`${id}-text`}
        rows={Math.min(12, Math.max(4, lines || 6))}
        maxLength={LIMITS.openChars}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-describedby={[describedBy, `${id}-hint`].filter(Boolean).join(" ")}
      />
      <p id={`${id}-hint`} className={`hint${over ? " over" : ""}`}>
        {lines > 0 ? (
          <>
            {words} / ~{limit} words · limit {lines} {lines === 1 ? "line" : "lines"}
            {over && " · over the limit: cut it down"}
          </>
        ) : (
          <>{words} words</>
        )}
        {value.length >= LIMITS.openChars && ` · ${LIMITS.openChars.toLocaleString("en")} characters is the maximum`}
      </p>
    </div>
  );
}

export function ModelAnswer({ model, rubric }: { model: string; rubric: string[] }) {
  return (
    <div className="model">
      {model && (
        <>
          <p className="ml">Model answer</p>
          <Html html={model} block className="ans" />
        </>
      )}
      {rubric.length > 0 && (
        <>
          <p className="ml">What the grader looks for</p>
          <ul className="rubric">
            {rubric.map((r, i) => (
              <li key={i}>
                <Html html={r} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Self-grade against the model answer: 0, half or full points.
export function SelfGrade({
  name,
  label,
  points,
  value,
  onChange,
}: {
  name: string;
  label: string; // the question, for screen readers ("question 3")
  points: number;
  value: number | undefined;
  onChange: (grade: number) => void;
}) {
  return (
    <fieldset className="grade">
      <legend>
        Grade your answer<span className="sr-only"> to {label}</span> against the model
      </legend>
      <div className="grade-opts">
        {GRADES.map((g) => (
          <label key={g} className={`gopt${value === g ? " on" : ""}`}>
            <input type="radio" name={name} value={g} checked={value === g} onChange={() => onChange(g)} />
            <span className="gl">{gradeLabel(g)}</span>
            <span className="gp">{pointsWord(g * points)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// An open question in a part: write within the line limit, then open the model answer and the rubric and grade
// yourself. Text and grade are saved with the progress.
export function OpenPractice({
  id,
  q,
  n,
  value,
  grade,
  onText,
  onGrade,
  onNote = null,
}: {
  id: string;
  q: GuideOpen;
  n: number; // the open question's number in the part, from 1
  value: string;
  grade: number | undefined;
  onText: (text: string) => void;
  onGrade: (grade: number) => void;
  onNote?: (() => void) | null;
}) {
  const [draft, change, flush] = useDraft(value, onText);
  const [open, setOpen] = useState(grade !== undefined);
  const stemId = `${id}-stem`;
  const hasModel = !!q.model || q.rubric.length > 0;
  return (
    <div className="q open-q">
      <div className="qh">
        <span className={`src ${q.src}`}>{q.src === "video" ? "Video drill" : "Paper"}</span>
        Open question · {n}
        <span className="pts">{pointsWord(q.points)}</span>
        {onNote && (
          <button type="button" className="qn" onClick={onNote}>
            + Note on this question
          </button>
        )}
      </div>
      {q.ctx && <Html html={q.ctx} block className="ctx" />}
      <Html id={stemId} html={q.stem} block className="stem" />
      <AnswerBox
        id={id}
        label={`open question ${n}`}
        describedBy={stemId}
        lines={q.lines}
        value={draft}
        onChange={change}
        onBlur={flush}
      />
      {hasModel && (
        <>
          <div className="qa">
            <button
              type="button"
              className="btn ghost"
              aria-expanded={open}
              aria-controls={`${id}-model`}
              onClick={() => setOpen(!open)}
            >
              {open ? "Hide model answer" : "Show model answer"}
            </button>
            {grade !== undefined && (
              <span className={`score ${grade === 1 ? "s2" : grade === 0.5 ? "s1" : "s0"}`}>
                Self-graded: {fmtPoints(grade * q.points)} of {pointsWord(q.points)}
              </span>
            )}
          </div>
          <div id={`${id}-model`} hidden={!open}>
            <ModelAnswer model={q.model} rubric={q.rubric} />
            <SelfGrade name={`${id}-grade`} label={`open question ${n}`} points={q.points} value={grade} onChange={onGrade} />
          </div>
        </>
      )}
    </div>
  );
}
