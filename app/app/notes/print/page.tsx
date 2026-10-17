import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { clock, groupNotes, NOTE_COLUMNS, noteDate, refLabel, type Note } from "@/lib/notes";
import { createClient } from "@/lib/supabase/server";
import { PrintNow } from "./print-now";
import "./print.css";

export const metadata: Metadata = { title: "Notes for the exam" };

type Outline = { n: number; title: string };
type GuideRow = { id: string; title: string; outline: unknown };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function outlineOf(v: unknown): Outline[] {
  return Array.isArray(v)
    ? v.filter((o): o is Outline => !!o && Number.isInteger((o as Outline).n) && typeof (o as Outline).title === "string")
    : [];
}

// The student's notes as a clean page for "Save as PDF": by course and part in course order, oldest first inside a
// part (the order they were written while studying). ?guide=<id> and ?kind=note|question narrow it down, as the
// filters on /app do. The print window opens by itself.
async function PrintBody({ guide, kind }: { guide: string | undefined; kind: string | undefined }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  let query = supabase.from("notes").select(NOTE_COLUMNS).order("created_at", { ascending: false }).limit(1000);
  if (guide && UUID.test(guide)) query = query.eq("guide_id", guide);
  if (guide === "general") query = query.is("guide_id", null);
  if (kind === "note" || kind === "question") query = query.eq("kind", kind);

  const [notesResult, guidesResult] = await Promise.all([
    query,
    supabase.from("guides").select("id, title, outline:content->outline").order("created_at", { ascending: true }),
  ]);
  if (notesResult.error || guidesResult.error) {
    return <p className="pp-empty">Your notes could not be loaded right now. Please try again in a moment.</p>;
  }
  const notes = (notesResult.data ?? []) as Note[];
  const guides = (guidesResult.data ?? []) as GuideRow[];
  const byId = new Map(guides.map((g) => [g.id, { title: g.title, parts: outlineOf(g.outline) }]));
  const groups = groupNotes(notes, guides, "course");
  const scope = guide && byId.get(guide) ? byId.get(guide)!.title : guide === "general" ? "General notes" : "All courses";
  const what = kind === "question" ? "questions" : kind === "note" ? "notes (no questions)" : "notes and questions";

  return (
    <>
      <PrintNow />
      <header className="pp-head">
        <h1>Notes for the exam</h1>
        <p>
          {scope} · {notes.length} {what} · Unlecture
        </p>
      </header>
      {notes.length === 0 && <p className="pp-empty">No notes to export yet.</p>}
      {groups.map((g, i) => {
        const info = g.guideId ? byId.get(g.guideId) : undefined;
        const showGuide = i === 0 || groups[i - 1].guideId !== g.guideId;
        const p = info && g.part !== null ? info.parts.find((x) => x.n === g.part) : undefined;
        return (
          <section key={g.key} className="pp-group">
            {showGuide && <h2>{info ? info.title : "General"}</h2>}
            {info && (
              <h3>{g.part === null ? "Whole course" : `Part ${g.part}${p?.title ? ` · ${p.title}` : ""}`}</h3>
            )}
            <ul>
              {g.notes
                .slice()
                .reverse()
                .map((n) => {
                  const about = n.video_at !== null ? `Video ${clock(n.video_at)}` : refLabel(n.ref);
                  return (
                    <li key={n.id} className={n.kind === "question" ? "ask" : undefined}>
                      <span className="pp-kind">{n.kind === "question" ? "Question" : "Note"}</span>
                      <span className="pp-body">{n.body}</span>
                      <span className="pp-meta">
                        {about && `${about} · `}
                        {noteDate(n.created_at)}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export default function NotesPrintPage({ searchParams }: PageProps<"/app/notes/print">) {
  return (
    <main id="main" className="pp">
      <div className="pp-bar">
        <Link href="/app#notes">← Back to your notes</Link>
        <span>In the print window, choose &ldquo;Save as PDF&rdquo;.</span>
      </div>
      <Suspense fallback={<p className="pp-empty">Loading your notes…</p>}>
        {searchParams.then(({ guide, kind }) => (
          <PrintBody guide={typeof guide === "string" ? guide : undefined} kind={typeof kind === "string" ? kind : undefined} />
        ))}
      </Suspense>
    </main>
  );
}
