import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { loadNotes } from "@/lib/notes-data";
import { CourseSummary } from "./course-summary";
import "../../my-guides.css";
import "../../notes.css";

export const metadata: Metadata = { title: "Summary of your notes" };

// "Show summary" on My notes: every note of a course on one page, without exporting a PDF. Questions to clear up
// first, then the key points saved, then the student's own notes part by part (reading order). ?guide=<id> shows
// one course; without it every course that has notes. Nothing is generated: it is the student's notes, sorted.

async function SummaryBody({ guide }: { guide: string | undefined }) {
  const { failed, one, courses, notesOf } = await loadNotes(guide);
  if (failed) return <p className="ns-none">Your notes could not be loaded right now. Please try again in a moment.</p>;
  const shown = one ? courses.filter((c) => c.id === one) : courses;
  const many = shown.length > 1;
  return (
    <>
      {courses.length > 1 && (
        <nav className="ns-courses" aria-label="Course">
          <Link href="/app/notes/summary" aria-current={!one ? "page" : undefined}>
            All courses
          </Link>
          {courses.map((c) => (
            <Link key={c.id} href={`/app/notes/summary?guide=${c.id}`} aria-current={one === c.id ? "page" : undefined}>
              {c.title}
            </Link>
          ))}
        </nav>
      )}
      {many && (
        <div className="ns-head">
          <div>
            <p className="eyebrow">Summary of your notes</p>
            <h1 className="title">All courses</h1>
          </div>
          <div className="nh-acts">
            <Link href="/app/notes/print" target="_blank" className="nh-btn primary">
              Export all as PDF
            </Link>
          </div>
        </div>
      )}
      {shown.length === 0 && (
        <>
          <h1 className="sr-only">Summary of your notes</h1>
          <p className="ns-none">
            No notes yet. Write one on <Link href="/app">My notes</Link>, or open a guide and press N while the video plays.
          </p>
        </>
      )}
      {shown.map((c) => (
        <CourseSummary key={c.id} c={c} notes={notesOf(c.id)} top={!many} />
      ))}
    </>
  );
}

export default function NotesSummaryPage({ searchParams }: PageProps<"/app/notes/summary">) {
  return (
    <main id="main" className="mg">
      <div className="mg-wrap">
        <div className="ns">
          <Link href="/app" className="ns-back">
            ← Back to my notes
          </Link>
          <Suspense fallback={<p className="ns-none">Loading your summary…</p>}>
            {searchParams.then(({ guide }) => (
              <SummaryBody guide={typeof guide === "string" ? guide : undefined} />
            ))}
          </Suspense>
        </div>
      </div>
    </main>
  );
}
