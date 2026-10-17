"use client";

import Link from "next/link";
import { useState } from "react";
import { groupNotes, NOTE_MAX, noteDate, noteHref, noteLinkLabel, type Note, type NoteKind } from "@/lib/notes";
import { deleteNote, saveNote } from "./notes-actions";

// /app, "My notes" (the main feature): write a note or a question (core-input, core-submit) and see every note
// (core-item), by course and part, newest group first, with a course switch, filters and search. Show summary and
// Export PDF follow the chosen course. Typing only in the text box and saving works: the course defaults to the
// chosen course, else the guide studied last, else the first guide. Every note belongs to a course; notes whose
// course is not on the list any more show under "Other".

export type NoteGuide = { id: string; slug: string; title: string; parts: { n: number; title: string }[] };
export type Resume = { guideId: string; slug: string; title: string; part: { n: number; title: string } | null };
type Show = "all" | NoteKind;

export function NotesHome({
  initial,
  guides,
  failed,
  resume,
}: {
  initial: Note[];
  guides: NoteGuide[];
  failed: boolean;
  resume: Resume | null;
}) {
  const [notes, setNotes] = useState(initial);
  // A fresh list from the server (after saving here or in a guide part) replaces the one on screen.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setNotes(initial);
  }
  const byId = new Map(guides.map((g) => [g.id, g]));
  const [course, setCourse] = useState("all"); // "all", a guide id, or "other"
  const [guideId, setGuideId] = useState(() => resume?.guideId ?? guides[0]?.id ?? "");
  const [part, setPart] = useState("");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<NoteKind>("note");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [query, setQuery] = useState("");

  const target = byId.get(guideId) ?? guides[0];
  const isOther = (n: Note) => !n.guide_id || !byId.has(n.guide_id);
  const others = notes.filter(isOther).length;
  const inCourse = (n: Note) => course === "all" || (course === "other" ? isOther(n) : n.guide_id === course);

  const pickCourse = (c: string) => {
    setCourse(c);
    if (byId.has(c)) {
      setGuideId(c);
      setPart("");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !target) return;
    setBusy(true);
    setError(null);
    setStatus("");
    const r = await saveNote({
      body: text,
      kind,
      source: "general",
      guideId: target.id,
      part: part !== "" ? Number(part) : null,
    });
    setBusy(false);
    if (!r.note) return setError(r.error);
    const saved = r.note;
    setNotes((ns) => [saved, ...ns.filter((n) => n.id !== saved.id)]);
    setText("");
    // Show everything again, so the new note is in sight at the top.
    setShow("all");
    setQuery("");
    if (course !== "all" && course !== target.id) setCourse("all");
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
  const scoped = notes.filter(inCourse);
  const shown = scoped.filter((n) => (show === "all" || n.kind === show) && (!q || n.body.toLowerCase().includes(q)));
  const groups = groupNotes(shown, guides, "recent");
  const questions = scoped.filter((n) => n.kind === "question").length;
  const param = byId.has(course) ? `?guide=${course}` : "";
  const count = (id: string) => notes.filter((n) => n.guide_id === id).length;

  const groupHead = (g: (typeof groups)[number]) => {
    const guide = g.guideId ? byId.get(g.guideId) : undefined;
    if (!guide) return { title: "Other notes", sub: "From a course that is not on your list any more", href: null };
    if (g.part === null) return { title: guide.title, sub: "Whole course", href: `/app/guides/${guide.slug}` };
    const p = guide.parts.find((x) => x.n === g.part);
    return {
      title: guide.title,
      sub: `Part ${g.part}${p?.title ? ` · ${p.title}` : ""}`,
      href: `/app/guides/${guide.slug}/${g.part}`,
    };
  };

  return (
    <div className="nh">
      <div className="nh-top">
        <div className="nh-intro">
          <h1>My notes</h1>
          <p>
            What you wrote while studying, by course and part. In a guide, press <kbd>N</kbd> while the video plays to
            note the moment.
          </p>
        </div>
        <div className="nh-acts">
          <Link href={`/app/notes/summary${param}`} className="nh-btn primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h10M4 18h13" />
            </svg>
            Show summary
          </Link>
          <Link href={`/app/notes/print${param}`} target="_blank" className="nh-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            Export PDF
          </Link>
        </div>
      </div>

      {resume && (
        <Link className="nh-resume" href={resume.part ? `/app/guides/${resume.slug}/${resume.part.n}` : `/app/guides/${resume.slug}`}>
          <span className="cap">Continue where you left off</span>
          <span>
            <b>{resume.title}</b>
            {resume.part ? ` · Part ${resume.part.n}${resume.part.title ? `: ${resume.part.title}` : ""}` : " · all parts done"}
          </span>
          <span aria-hidden="true" className="arr">
            →
          </span>
        </Link>
      )}

      {(guides.length > 1 || others > 0) && (
        <div className="nh-courses" role="group" aria-label="Course">
          <button type="button" aria-pressed={course === "all"} onClick={() => pickCourse("all")}>
            All courses · {notes.length}
          </button>
          {guides.map((g) => (
            <button key={g.id} type="button" aria-pressed={course === g.id} onClick={() => pickCourse(g.id)}>
              {g.title} · {count(g.id)}
            </button>
          ))}
          {others > 0 && (
            <button type="button" aria-pressed={course === "other"} onClick={() => pickCourse("other")}>
              Other · {others}
            </button>
          )}
        </div>
      )}

      <form className="nh-form" onSubmit={submit}>
        <div className="nh-form-head">
          <label htmlFor="core-input">{kind === "question" ? "Your question" : "New note"}</label>
          <div className="nh-seg" role="group" aria-label="Save as">
            <button type="button" aria-pressed={kind === "note"} onClick={() => setKind("note")}>
              Note
            </button>
            <button type="button" aria-pressed={kind === "question"} className="ask" onClick={() => setKind("question")}>
              Question
            </button>
          </div>
        </div>
        <textarea
          id="core-input"
          data-testid="core-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={NOTE_MAX}
          placeholder={
            kind === "question"
              ? "e.g. Why is budgeted production lower than sales?"
              : "e.g. Production = sales + target ending inventory − beginning inventory"
          }
          aria-describedby={error ? "core-error" : undefined}
        />
        <div className="nh-form-row">
          {guides.length > 0 ? (
            <>
              <label className="nh-select">
                Course
                <select
                  value={target?.id ?? ""}
                  onChange={(e) => {
                    setGuideId(e.target.value);
                    setPart("");
                  }}
                >
                  {guides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
              {target && target.parts.length > 0 && (
                <label className="nh-select">
                  Part
                  <select value={part} onChange={(e) => setPart(e.target.value)}>
                    <option value="">Whole course</option>
                    {target.parts.map((p) => (
                      <option key={p.n} value={String(p.n)}>
                        Part {p.n}
                        {p.title ? ` · ${p.title.slice(0, 60)}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <p className="nh-hint">No course is open yet, so there is no place for a note. Courses appear under My guides.</p>
          )}
          <button type="submit" data-testid="core-submit" className="nh-save" disabled={busy || !target}>
            {busy ? "Saving…" : kind === "question" ? "Save question" : "Save note"}
          </button>
        </div>
        {error && (
          <p id="core-error" role="alert" className="nh-error">
            {error}
          </p>
        )}
        <p className="nh-status" role="status">
          {status}
        </p>
      </form>

      {failed ? (
        <p className="nh-empty">Your notes could not be loaded right now. Please try again in a moment.</p>
      ) : notes.length === 0 ? (
        <p className="nh-empty">No notes yet. Write your first one above, or open a guide and press N while the video plays.</p>
      ) : (
        <>
          <div className="nh-filters">
            <div className="nh-seg" role="group" aria-label="Show">
              {(["all", "note", "question"] as Show[]).map((s) => (
                <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>
                  {s === "all" ? `All ${scoped.length}` : s === "note" ? `Notes ${scoped.length - questions}` : `Questions ${questions}`}
                </button>
              ))}
            </div>
            <label className="nh-search">
              <span className="sr-only">Search your notes</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes" />
            </label>
          </div>

          {groups.length === 0 && <p className="nh-empty">No notes match this filter.</p>}
          {groups.map((g) => {
            const h = groupHead(g);
            const guide = g.guideId ? byId.get(g.guideId) : undefined;
            return (
              <section key={g.key} className="nh-group" aria-label={`${h.title}, ${h.sub}`}>
                <div className="nh-group-head">
                  <h2>{h.title}</h2>
                  <span>{h.sub}</span>
                  {h.href && (
                    <Link href={h.href} className="open">
                      {g.part === null ? "Open course" : "Open part"}
                    </Link>
                  )}
                </div>
                <ul>
                  {g.notes.map((n) => {
                    const label = guide ? noteLinkLabel(n) : null;
                    return (
                      <li key={n.id} data-testid="core-item" className={n.kind === "question" ? "nh-card ask" : "nh-card"}>
                        <span className="nh-kind">{n.kind === "question" ? "Question" : n.source === "keypoint" ? "Key point" : "Note"}</span>
                        <p className="nh-body">{n.body}</p>
                        <span className="nh-meta">
                          {label && guide && <Link href={noteHref(guide.slug, n)}>{label}</Link>}
                          <time dateTime={n.created_at}>{noteDate(n.created_at)}</time>
                          <button type="button" onClick={() => remove(n)} aria-label={`Delete: ${n.body.slice(0, 60)}`}>
                            Delete
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
