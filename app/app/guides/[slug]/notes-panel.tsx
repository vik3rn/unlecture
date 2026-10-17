"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { clock, NOTE_MAX, type Note } from "@/lib/notes";
import { useNotes } from "./notes-context";

type Filter = "all" | "note" | "question";

// The notes panel of a guide part: the part's notes (newest first, filter by kind), and the composer. On wide
// screens it stays beside the video and the quiz; on phones it opens from the "Notes" button as a bottom sheet;
// in study mode it sits next to the video in fullscreen.
export function NotesPanel() {
  const n = useNotes();
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const c = n.compose;

  // Something opened the composer (the video button, N, a quiz question): focus the text box.
  useEffect(() => {
    if (c.tick > 0) box.current?.focus({ preventScroll: true });
  }, [c.tick]);

  // Escape closes the sheet on a phone (the text box handles its own Escape first).
  const { sheetOpen, setSheetOpen } = n;
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen, setSheetOpen]);

  if (!n.enabled) return null;

  const qByKey = new Map(n.questions.map((q) => [q.key, q]));
  // What a question is about: the chosen quiz question, else the last one answered, else the video moment.
  const about = c.ref ?? (c.videoAt !== null ? "video" : c.kind === "question" && n.lastQuestion ? n.lastQuestion : "general");
  const aboutQ = qByKey.get(about);
  const videoAt = c.videoAt ?? n.player()?.time() ?? null;

  const setAbout = (v: string) => {
    if (v === "video") n.patchCompose({ ref: null, source: "video", videoAt: videoAt !== null ? Math.floor(videoAt) : null });
    else if (v === "general") n.patchCompose({ ref: null, source: "general", videoAt: null });
    else n.patchCompose({ ref: v, source: "quiz", videoAt: null });
  };

  const save = async (body: string, extra: Partial<Note> = {}) => {
    if (busy) return;
    setBusy(true);
    const ref = extra.ref !== undefined ? extra.ref : about !== "video" && about !== "general" ? about : null;
    const ok = await n.add({
      body,
      kind: extra.kind ?? c.kind,
      source: ref ? "quiz" : about === "video" || c.videoAt !== null ? "video" : c.source === "keypoint" ? "keypoint" : "general",
      ref,
      videoAt: about === "video" || c.videoAt !== null ? (c.videoAt ?? (videoAt !== null ? Math.floor(videoAt) : null)) : null,
    });
    setBusy(false);
    if (!ok) return;
    setText("");
    if (c.resume) n.player()?.play();
    n.closeCompose();
  };

  const cancel = () => {
    if (c.resume) n.player()?.play();
    n.closeCompose();
  };
  // A note about a question: go to that question (and close the sheet on a phone).
  const jump = (key: string) => {
    const stem = document.getElementById(`q-${key}-stem`) ?? document.getElementById(`o-${key}-stem`);
    stem?.closest(".q")?.scrollIntoView({ behavior: "smooth", block: "start" });
    n.setSheetOpen(false);
  };

  const shown = n.notes.filter((x) => filter === "all" || x.kind === filter);
  const count = (k: Filter) => (k === "all" ? n.notes.length : n.notes.filter((x) => x.kind === k).length);

  return (
    <>
      <button
        type="button"
        className="np-fab"
        aria-expanded={n.sheetOpen}
        aria-controls="part-notes"
        onClick={() => n.setSheetOpen(!n.sheetOpen)}
      >
        Notes · {n.notes.length}
      </button>
      {n.sheetOpen && <div className="np-shade" onClick={() => n.setSheetOpen(false)} />}
      <aside id="part-notes" className={n.sheetOpen ? "np open" : "np"} aria-label="Your notes">
        <div className="np-head">
          <b>Your notes</b>
          <span>{n.notes.length === 1 ? "1 note" : `${n.notes.length} notes`} in this part</span>
          {n.study && (
            <button type="button" className="np-exit" onClick={n.toggleStudy}>
              Exit study mode
            </button>
          )}
          <button type="button" className="np-close" onClick={() => n.setSheetOpen(false)} aria-label="Close notes">
            ×
          </button>
        </div>
        <div className="np-seg" role="group" aria-label="Show">
          {(["all", "note", "question"] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "note" ? "Notes" : "Questions"} {count(f)}
            </button>
          ))}
        </div>

        <ul className="np-list">
          {shown.map((x) => {
            const q = x.ref ? qByKey.get(x.ref) : undefined;
            return (
              <li key={x.id} className={x.kind === "question" ? "np-item ask" : "np-item"}>
                <span className="np-meta">
                  <span className="np-kind">{x.kind === "question" ? "Question" : "Note"}</span>
                  {x.video_at !== null ? (
                    <button type="button" className="np-at" onClick={() => n.player()?.seek(x.video_at as number)}>
                      ▶ {clock(x.video_at)}
                    </button>
                  ) : q ? (
                    <button type="button" className="np-src link" onClick={() => jump(q.key)}>
                      {q.label}
                    </button>
                  ) : x.source === "keypoint" ? (
                    <span className="np-src">Key point</span>
                  ) : null}
                  <button
                    type="button"
                    className="np-del"
                    onClick={() => n.remove(x.id)}
                    aria-label={`Delete note: ${x.body.slice(0, 60)}`}
                  >
                    Delete
                  </button>
                </span>
                <span className="np-body">{x.body}</span>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="np-empty">
              {n.notes.length === 0
                ? "No notes yet. Press N or the Note button on the video, or write one below."
                : "Nothing here with this filter."}
            </li>
          )}
        </ul>

        <form
          className="np-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(text);
          }}
        >
          <div className="np-seg" role="group" aria-label="Mark as">
            <button type="button" aria-pressed={c.kind === "note"} onClick={() => n.patchCompose({ kind: "note" })}>
              Note
            </button>
            <button
              type="button"
              aria-pressed={c.kind === "question"}
              className="ask"
              onClick={() => n.patchCompose({ kind: "question" })}
            >
              Question
            </button>
          </div>
          {(c.kind === "question" || c.ref) && n.questions.length > 0 ? (
            <label className="np-about">
              About
              <select value={about} onChange={(e) => setAbout(e.target.value)}>
                {n.questions.map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.label}
                    {q.key === n.lastQuestion ? " (last answered)" : ""}
                  </option>
                ))}
                {videoAt !== null && <option value="video">Video at {clock(videoAt)}</option>}
                <option value="general">General</option>
              </select>
            </label>
          ) : (
            c.videoAt !== null && (
              <span className="np-chip">
                at {clock(c.videoAt)}
                <button type="button" onClick={() => n.patchCompose({ videoAt: null, source: "general" })} aria-label="Do not link this note to the video">
                  ×
                </button>
              </span>
            )
          )}
          {aboutQ && (c.kind === "question" || c.ref) && (
            <>
              <p className="np-quote">{aboutQ.stem}</p>
              <button
                type="button"
                className="np-quick"
                disabled={busy}
                onClick={() => save(`I don't understand this one: ${aboutQ.stem}`.slice(0, NOTE_MAX), { kind: "question", ref: aboutQ.key })}
              >
                I don&apos;t understand this one
              </button>
            </>
          )}
          <label htmlFor="np-text" className="np-label">
            {aboutQ && (c.kind === "question" || c.ref) ? "Or write it in your own words" : c.kind === "question" ? "Your question" : "New note"}
          </label>
          <textarea
            id="np-text"
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl + Enter saves, Escape cancels.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
                e.preventDefault();
                void save(text);
              } else if (e.key === "Escape" && c.tick > 0) {
                e.preventDefault();
                cancel();
              }
            }}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            rows={3}
            maxLength={NOTE_MAX}
            placeholder={c.kind === "question" ? "What do you want to check or ask?" : "Write what you want to remember…"}
          />
          {n.error && (
            <p role="alert" className="np-error">
              {n.error}
            </p>
          )}
          <div className="np-row">
            {c.tick > 0 && (
              <button type="button" className="np-cancel" onClick={cancel}>
                Cancel
              </button>
            )}
            <button type="submit" className="np-save" disabled={busy || !text.trim()}>
              {busy ? "Saving…" : c.resume ? "Save and play" : "Save"}
            </button>
          </div>
        </form>

        <div className="np-foot">
          <Link href={`/app/notes/print?guide=${n.guideId}`} target="_blank" className="np-export">
            Export notes as PDF
          </Link>
          <Link href="/app#notes">All my notes</Link>
        </div>
      </aside>
    </>
  );
}
