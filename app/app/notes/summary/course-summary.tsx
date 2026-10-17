import Link from "next/link";
import { clock, noteHref, noteLinkLabel, partName, summarize, summaryText, writtenSpan, type Note } from "@/lib/notes";
import type { NotesCourse } from "@/lib/notes-data";
import { CopySummary } from "./copy-summary";

// One course of the summary page: the title, Export PDF and Copy as text, the counts, then the questions to clear
// up, the key points and the student's own notes part by part. `top`: the course is the page's h1.
export function CourseSummary({ c, notes, top }: { c: NotesCourse; notes: Note[]; top: boolean }) {
  const s = summarize(notes);
  const Title = top ? "h1" : "h2";
  const H = top ? "h2" : "h3";
  const P = top ? "h3" : "h4";
  const span = writtenSpan(s.first, s.last);
  const where = (n: Note) => (n.part === null ? "Whole course" : `Part ${n.part}`);
  return (
    <section className="ns-course" aria-labelledby={`sum-${c.id}`}>
      <div className="ns-head">
        <div>
          {top && <p className="eyebrow">Summary of your notes</p>}
          <Title id={`sum-${c.id}`} className="title">
            {c.title}
          </Title>
          <p className="ns-meta">
            {s.total} {s.total === 1 ? "note" : "notes and questions"} from {s.covered} of {c.parts.length} parts
            {span && `, written ${span}`}
          </p>
        </div>
        <div className="nh-acts">
          <Link href={`/app/notes/print?guide=${c.id}`} target="_blank" className="nh-btn primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            Export PDF
          </Link>
          <CopySummary text={summaryText(c.title, c.parts, s)} />
        </div>
      </div>

      <ul className="ns-stats" aria-label="At a glance">
        <li className="warm">
          <b>{s.questions.length}</b>
          <span>{s.questions.length === 1 ? "question to clear up" : "questions to clear up"}</span>
        </li>
        <li>
          <b>{s.keyPoints.length}</b>
          <span>{s.keyPoints.length === 1 ? "key point saved" : "key points saved"}</span>
        </li>
        <li>
          <b>{s.own.length}</b>
          <span>{s.own.length === 1 ? "note in your own words" : "notes in your own words"}</span>
        </li>
      </ul>

      {s.questions.length > 0 && (
        <div className="ns-sec">
          <H className="ns-h">Questions to clear up</H>
          <p>Go back to these before the exam, or take them to class.</p>
          <ol className="ns-qs">
            {s.questions.map((n, i) => {
              const label = noteLinkLabel(n);
              return (
                <li key={n.id}>
                  <span className="no">{i + 1}</span>
                  <span className="body">{n.body}</span>
                  <span className="where">
                    <span>{where(n)}</span>
                    {label && (
                      <Link href={noteHref(c.slug, n)} className="go">
                        {label}
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {s.keyPoints.length > 0 && (
        <div className="ns-sec">
          <H className="ns-h">Key points you saved</H>
          <ul className="ns-keys">
            {s.keyPoints.map((n) => (
              <li key={n.id}>
                <span className="body">{n.body}</span>
                <span className="where">{partName(c.parts, n.part)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.parts.length > 0 && (
        <div className="ns-sec">
          <H className="ns-h">Your notes, part by part</H>
          {s.parts.map((g) => (
            <div key={String(g.part)} className="ns-part">
              <P className="ns-ph">
                {g.part === null ? (
                  partName(c.parts, null)
                ) : (
                  <Link href={`/app/guides/${c.slug}/${g.part}`}>{partName(c.parts, g.part)}</Link>
                )}
              </P>
              <ul>
                {g.notes.map((n) => (
                  <li key={n.id}>
                    {n.video_at !== null ? (
                      <Link href={noteHref(c.slug, n)} className="at" aria-label={`Watch at ${clock(n.video_at)}`}>
                        {clock(n.video_at)}
                      </Link>
                    ) : (
                      <span className="at none" aria-hidden="true">
                        –
                      </span>
                    )}
                    <span className="body">{n.body}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
