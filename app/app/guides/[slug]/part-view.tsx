"use client";

import Link from "next/link";
import { plain, type GuideFormat, type GuidePart } from "@/lib/guides";
import type { Note } from "@/lib/notes";
import { NotesProvider, useNotes, type PartTitle } from "./notes-context";
import { NotesPanel } from "./notes-panel";
import { PartContent } from "./part-content";
import { saveFailed, saveLabel, useGuide } from "./progress";
import { Html } from "./ui";

export type PartLink = { n: number; title: string; locked: boolean } | null;

type PartViewProps = {
  part: GuidePart;
  prev: PartLink;
  next: PartLink;
  total: number; // number of parts
  last: number; // number of the last part (parts may start at 0)
  brand: string;
  format: GuideFormat;
  // Logged in only: the guide's id, its parts and the student's notes for the whole course (the free preview has
  // no notes).
  notes?: { guideId: string; items: Note[]; parts: PartTitle[] };
  startAt?: number | null; // ?t= from a note: the video starts there
};

export function PartView(props: PartViewProps) {
  return (
    <NotesProvider
      enabled={!!props.notes}
      guideId={props.notes?.guideId ?? ""}
      part={props.part}
      parts={props.notes?.parts ?? []}
      initial={props.notes?.items ?? []}
    >
      <PartBody {...props} />
    </NotesProvider>
  );
}

function PartBody({ part, prev, next, total, last, brand, format, startAt }: PartViewProps) {
  const { base, guest, progress, update, saveState } = useGuide();
  const { setRoot, enabled: withNotes, study } = useNotes();
  const done = !!progress.done[part.n];
  const doneCount = Object.keys(progress.done).length;
  const questions = part.drills.length + part.mcs.length;

  const toggleDone = () =>
    update((p) => {
      const d = { ...p.done };
      if (d[part.n]) delete d[part.n];
      else d[part.n] = true;
      return { ...p, done: d };
    });

  const navLink = (l: PartLink, dir: "prev" | "next") => {
    if (!l) return <span />;
    const label = dir === "prev" ? "Previous" : "Next";
    if (l.locked) {
      return (
        <Link href="/signup" className={`nav ${dir} locked`}>
          <span className="k">🔒 {label}: sign up to open</span>
          <span className="t">
            Part {l.n} · {plain(l.title)}
          </span>
        </Link>
      );
    }
    return (
      <Link href={`${base}/${l.n}`} className={`nav ${dir}`}>
        <span className="k">{dir === "prev" ? `← ${label}` : `${label} →`}</span>
        <span className="t">
          Part {l.n} · {plain(l.title)}
        </span>
      </Link>
    );
  };

  return (
    <div className="dg">
      <header className="bar">
        <Link href={base} className="back">
          ← Course
        </Link>
        <span className="crumb">
          <span className="brand">{brand}</span>
          <span className="pos">
            Part {part.n} of {last}
          </span>
        </span>
        <span
          className="meter"
          role="progressbar"
          aria-label="Parts done"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <i style={{ width: `${(100 * doneCount) / Math.max(1, total)}%` }} />
        </span>
        <span className={`save${saveFailed(saveState) ? " err" : ""}`} aria-live="polite">
          {guest ? "" : saveLabel[saveState]}
        </span>
      </header>
      {guest && (
        <p className="guest">
          Free preview: nothing you do here is saved. <Link href="/signup">Sign up free</Link> to open every part and keep
          your progress.
        </p>
      )}

      <div ref={setRoot} className={`pv${withNotes ? " with-notes" : ""}${study ? " study" : ""}`}>
      <main id="main" className="page">
        <p className="eyebrow">
          Part {part.n} · <Html html={part.unit} />
        </p>
        <h1>
          <Html html={part.title} />
        </h1>
        <p className="meta">
          {part.dur}
          {part.chapters.length > 1 && ` · ${part.chapters.length - 1} chapters`}
          {questions > 0 && ` · ${questions} ${questions === 1 ? "question" : "questions"}`}
          {part.works.length > 0 && ` · ${part.works.length} exercises`}
          {part.opens.length > 0 && ` · ${part.opens.length} open ${part.opens.length === 1 ? "question" : "questions"}`}
        </p>

        <PartContent part={part} format={format} startAt={startAt} />

        <div className="finish">
          <button type="button" className={`done-btn${done ? " on" : ""}`} aria-pressed={done} onClick={toggleDone}>
            {done ? "✓ Part done" : "Mark part as done"}
          </button>
          {guest && <span className="hint">In the free preview this is not saved.</span>}
        </div>

        <nav className="pager" aria-label="Parts">
          {navLink(prev, "prev")}
          {navLink(next, "next")}
        </nav>
      </main>
      <NotesPanel />
      </div>
    </div>
  );
}
