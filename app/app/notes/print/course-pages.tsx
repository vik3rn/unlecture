import { clock, partName, summarize, writtenSpan, type Note } from "@/lib/notes";
import type { NotesCourse } from "@/lib/notes-data";

// One course in the PDF: title, counts, questions to clear up, key points, own notes part by part.
export function CoursePages({ c, notes }: { c: NotesCourse; notes: Note[] }) {
  const s = summarize(notes);
  const span = writtenSpan(s.first, s.last);
  const at = (n: Note) => (n.video_at !== null ? clock(n.video_at) : "");
  return (
    <section className="pp-course" aria-labelledby={`pp-${c.id}`}>
      <h1 id={`pp-${c.id}`}>{c.title}</h1>
      <p className="pp-sub">
        Your notes and questions: {s.total} from {s.covered} of {c.parts.length} parts{span && `, written ${span}`}
      </p>
      <div className="pp-glance">
        <div className="warm">
          <b>{s.questions.length}</b>
          <span>{s.questions.length === 1 ? "question to clear up" : "questions to clear up"}</span>
        </div>
        <div>
          <b>{s.keyPoints.length}</b>
          <span>{s.keyPoints.length === 1 ? "key point saved" : "key points saved"}</span>
        </div>
        <div>
          <b>{s.own.length}</b>
          <span>{s.own.length === 1 ? "note in your own words" : "notes in your own words"}</span>
        </div>
      </div>

      {s.questions.length > 0 && (
        <>
          <h2>Questions to clear up</h2>
          <ol className="pp-rows">
            {s.questions.map((n, i) => (
              <li key={n.id}>
                <span className="no">{i + 1}</span>
                <span className="body">{n.body}</span>
                <span className="where">{[n.part === null ? "Whole course" : `Part ${n.part}`, at(n)].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {s.keyPoints.length > 0 && (
        <>
          <h2>Key points you saved</h2>
          <ul className="pp-rows">
            {s.keyPoints.map((n) => (
              <li key={n.id}>
                <span className="body strong">{n.body}</span>
                <span className="where">{n.part === null ? "Whole course" : `Part ${n.part}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {s.parts.length > 0 && (
        <>
          <h2>Your notes, part by part</h2>
          {s.parts.map((g) => (
            <div key={String(g.part)} className="pp-part">
              <h3>{partName(c.parts, g.part)}</h3>
              <ul>
                {g.notes.map((n) => (
                  <li key={n.id}>
                    <span className="at">{at(n)}</span>
                    <span className="body">{n.body}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
