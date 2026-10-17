"use client";

import Link from "next/link";
import { useState } from "react";
import { clock, groupNotes, NOTE_MAX, noteDate, noteHref, refLabel, type Note, type NoteKind } from "@/lib/notes";
import { deleteNote, saveNote } from "./notes-actions";

// /app, "Your notes for the exam" (the main feature): write a note or a question (core-input, core-submit), and see
// every note from every guide (core-item), grouped by guide and part, newest group first. Notes written in a guide
// part link back to the video moment or the question. Typing only in the text box and saving works: the other
// fields default to a general note.

export type NoteGuide = { id: string; slug: string; title: string; parts: { n: number; title: string }[] };
type Show = "all" | NoteKind;

export function NotesOverview({ initial, guides, failed }: { initial: Note[]; guides: NoteGuide[]; failed: boolean }) {
  const [notes, setNotes] = useState(initial);
  // A fresh list from the server (after saving here or in a guide part) replaces the one on screen.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setNotes(initial);
  }
  const [text, setText] = useState("");
  const [kind, setKind] = useState<NoteKind>("note");
  const [guideId, setGuideId] = useState("");
  const [part, setPart] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [inGuide, setInGuide] = useState("all");
  const [query, setQuery] = useState("");

  const byId = new Map(guides.map((g) => [g.id, g]));
  const chosen = byId.get(guideId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus("");
    const r = await saveNote({
      body: text,
      kind,
      source: "general",
      guideId: guideId || null,
      part: guideId && part !== "" ? Number(part) : null,
    });
    setBusy(false);
    if (!r.note) return setError(r.error);
    const saved = r.note;
    setNotes((ns) => [saved, ...ns.filter((n) => n.id !== saved.id)]);
    setText("");
    // Show everything again, so the new note is in sight at the top.
    setShow("all");
    setInGuide("all");
    setQuery("");
    setStatus(kind === "question" ? "Question saved." : "Note saved.");
  };

  const remove = async (n: Note) => {
    setError(null);
    const r = await deleteNote(n.id);
    if (r.error) return setError(r.error);
    setNotes((ns) => ns.filter((x) => x.id !== n.id));
    setStatus("Note deleted.");
  };

  const q = query.trim().toLowerCase();
  const shown = notes.filter(
    (n) =>
      (show === "all" || n.kind === show) &&
      (inGuide === "all" || (inGuide === "general" ? !n.guide_id || !byId.has(n.guide_id) : n.guide_id === inGuide)) &&
      (!q || n.body.toLowerCase().includes(q)),
  );
  const groups = groupNotes(shown, guides, "recent");
  const questions = notes.filter((n) => n.kind === "question").length;
  const exportHref = `/app/notes/print${
    inGuide !== "all" || show !== "all"
      ? `?${new URLSearchParams({ ...(inGuide !== "all" && { guide: inGuide }), ...(show !== "all" && { kind: show }) })}`
      : ""
  }`;

  const groupTitle = (g: (typeof groups)[number]) => {
    const guide = g.guideId ? byId.get(g.guideId) : undefined;
    if (!guide) return { title: "General", sub: null, href: null };
    if (g.part === null) return { title: guide.title, sub: "Whole course", href: `/app/guides/${guide.slug}` };
    const p = guide.parts.find((x) => x.n === g.part);
    return {
      title: guide.title,
      sub: `Part ${g.part}${p?.title ? ` · ${p.title}` : ""}`,
      href: `/app/guides/${guide.slug}/${g.part}`,
    };
  };

  return (
    <section id="notes" className="mn" aria-labelledby="notes-h">
      <div className="mn-head">
        <div>
          <h2 id="notes-h">Your notes for the exam</h2>
          <p>
            Write down what you want to remember and what you still don&apos;t get. In a guide, press <kbd>N</kbd> while
            the video plays to note the moment.
          </p>
        </div>
        <Link href={exportHref} target="_blank" className="mn-export">
          Export as PDF
        </Link>
      </div>

      <form className="mn-form" onSubmit={submit}>
        <div className="mn-kinds" role="group" aria-label="Save as">
          <button type="button" aria-pressed={kind === "note"} onClick={() => setKind("note")}>
            Note
          </button>
          <button type="button" aria-pressed={kind === "question"} className="ask" onClick={() => setKind("question")}>
            Question
          </button>
        </div>
        <label htmlFor="core-input" className="mn-label">
          {kind === "question" ? "Your question" : "New note"}
        </label>
        <textarea
          id="core-input"
          data-testid="core-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={NOTE_MAX}
          placeholder={
            kind === "question"
              ? "e.g. Why does the standard error get smaller with more data?"
              : "e.g. Fixed costs stay the same when volume changes"
          }
          aria-describedby={error ? "core-error" : undefined}
        />
        <div className="mn-row">
          <label className="mn-select">
            Course
            <select
              value={guideId}
              onChange={(e) => {
                setGuideId(e.target.value);
                setPart("");
              }}
            >
              <option value="">General</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          {chosen && chosen.parts.length > 0 && (
            <label className="mn-select">
              Part
              <select value={part} onChange={(e) => setPart(e.target.value)}>
                <option value="">Whole course</option>
                {chosen.parts.map((p) => (
                  <option key={p.n} value={String(p.n)}>
                    Part {p.n}
                    {p.title ? ` · ${p.title.slice(0, 60)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" data-testid="core-submit" className="mn-save" disabled={busy}>
            {busy ? "Saving…" : kind === "question" ? "Save question" : "Save note"}
          </button>
        </div>
        {error && (
          <p id="core-error" role="alert" className="mn-error">
            {error}
          </p>
        )}
        <p className="mn-status" role="status">
          {status}
        </p>
      </form>

      {failed ? (
        <p className="mn-empty">Your notes could not be loaded right now. Please try again in a moment.</p>
      ) : notes.length === 0 ? (
        <p className="mn-empty">No notes yet. Write your first one above, or open a guide and press Note on the video.</p>
      ) : (
        <>
          <div className="mn-filters">
            <div className="mn-kinds" role="group" aria-label="Show">
              {(["all", "note", "question"] as Show[]).map((s) => (
                <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>
                  {s === "all"
                    ? `All ${notes.length}`
                    : s === "note"
                      ? `Notes ${notes.length - questions}`
                      : `Questions ${questions}`}
                </button>
              ))}
            </div>
            <label className="mn-select">
              <span className="sr-only">Course</span>
              <select value={inGuide} onChange={(e) => setInGuide(e.target.value)} aria-label="Show notes from">
                <option value="all">All courses</option>
                {guides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
                <option value="general">General</option>
              </select>
            </label>
            <label className="mn-search">
              <span className="sr-only">Search your notes</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes" />
            </label>
          </div>

          {groups.length === 0 && <p className="mn-empty">No notes match this filter.</p>}
          {groups.map((g) => {
            const t = groupTitle(g);
            const guide = g.guideId ? byId.get(g.guideId) : undefined;
            return (
              <div key={g.key} className="mn-group">
                <h3>
                  {t.href ? <Link href={t.href}>{t.title}</Link> : t.title}
                  {t.sub && <span>{t.sub}</span>}
                </h3>
                <ul>
                  {g.notes.map((n) => {
                    const about = n.video_at !== null ? `▶ ${clock(n.video_at)}` : refLabel(n.ref);
                    return (
                      <li key={n.id} data-testid="core-item" className={n.kind === "question" ? "mn-item ask" : "mn-item"}>
                        <span className="mn-kind">{n.kind === "question" ? "Question" : "Note"}</span>
                        <p className="mn-body">{n.body}</p>
                        <span className="mn-meta">
                          {about && guide ? (
                            <Link href={noteHref(guide.slug, n)}>{about}</Link>
                          ) : (
                            about && <span>{about}</span>
                          )}
                          <time dateTime={n.created_at}>{noteDate(n.created_at)}</time>
                          <button type="button" onClick={() => remove(n)} aria-label={`Delete: ${n.body.slice(0, 60)}`}>
                            Delete
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
