import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/app/components/logo";
import { noteDate } from "@/lib/notes";
import { loadNotes } from "@/lib/notes-data";
import { CoursePages } from "./course-pages";
import { PrintNow } from "./print-now";
import "./print.css";

export const metadata: Metadata = { title: "Notes for the exam" };

// When the page was exported (outside the components, which stay pure).
function today() {
  return noteDate(new Date().toISOString());
}

// The notes as a document for "Save as PDF": the Unlecture letterhead, then per course the same order as the
// summary (questions to clear up, key points, notes part by part), each course on a new page. ?guide=<id> exports
// one course. The print window opens by itself. No email or name on the page: it is the student's own copy.

async function PrintBody({ guide }: { guide: string | undefined }) {
  const { failed, one, courses, notesOf } = await loadNotes(guide);
  if (failed) return <p className="pp-empty">Your notes could not be loaded right now. Please try again in a moment.</p>;
  const shown = one ? courses.filter((c) => c.id === one) : courses;
  return (
    <>
      <PrintNow />
      <div className="pp-letter">
        <span className="brand">
          <LogoMark size={36} title="Unlecture" />
          Unlecture
        </span>
        <span className="what">
          <b>Notes for the exam</b>
          <span>Exported {today()}</span>
        </span>
      </div>
      {shown.length === 0 && (
        <>
          <h1>Notes for the exam</h1>
          <p className="pp-empty">No notes to export yet.</p>
        </>
      )}
      {shown.map((c) => (
        <CoursePages key={c.id} c={c} notes={notesOf(c.id)} />
      ))}
      <p className="pp-foot">
        <span>Made with Unlecture · unlecture.vercel.app</span>
        <span>A student project, not an official IE University product.</span>
      </p>
    </>
  );
}

export default function NotesPrintPage({ searchParams }: PageProps<"/app/notes/print">) {
  return (
    <main id="main" className="pp">
      <div className="pp-bar">
        <Link href="/app">← Back to my notes</Link>
        <span>In the print window, choose &ldquo;Save as PDF&rdquo;.</span>
      </div>
      <Suspense fallback={<p className="pp-empty">Loading your notes…</p>}>
        {searchParams.then(({ guide }) => <PrintBody guide={typeof guide === "string" ? guide : undefined} />)}
      </Suspense>
    </main>
  );
}
