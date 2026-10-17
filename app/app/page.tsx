import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NOTE_COLUMNS, type Note } from "@/lib/notes";
import { createClient } from "@/lib/supabase/server";
import { NotesHome, type NoteGuide, type Resume } from "./notes-overview";
import "./my-guides.css";
import "./notes.css";

// /app, "My notes": the main feature (core-input, core-submit, core-item in notes-overview.tsx). Every note of the
// student, by course and part, with the composer, filters, Show summary and Export PDF, and a link back to the
// guide they studied last. The guides themselves are under /app/guides. Light data only: guide rows with
// `content->outline` (small, written by the seed), never the whole guide content.

export const metadata: Metadata = { title: "My notes" };

type Outline = { n: number; title: string };
type GuideRow = { id: string; slug: string; title: string; outline: unknown };
type ProgressRow = { guide_id: string; done: Record<string, boolean> | null; updated_at: string };

function outlineOf(v: unknown): Outline[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((o): o is Outline => {
      const x = o as Partial<Outline> | null;
      return !!x && typeof x === "object" && Number.isInteger(x.n) && typeof x.title === "string";
    })
    .slice(0, 200)
    .map((o) => ({ n: o.n, title: o.title.slice(0, 200) }));
}

async function Notes() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  // RLS: every logged-in user can read guides; progress and note rows are the user's own.
  const [guidesResult, progressResult, notesResult] = await Promise.all([
    supabase.from("guides").select("id, slug, title, outline:content->outline").order("created_at", { ascending: true }),
    supabase
      .from("guide_progress")
      .select("guide_id, done:progress->done, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase.from("notes").select(NOTE_COLUMNS).order("created_at", { ascending: false }).limit(1000),
  ]);

  const guides: NoteGuide[] = ((guidesResult.data ?? []) as GuideRow[]).map((g) => ({
    id: g.id,
    slug: g.slug,
    title: g.title,
    parts: outlineOf(g.outline),
  }));
  const byId = new Map(guides.map((g) => [g.id, g]));

  // "Continue where you left off": the first part not done in the guide studied last.
  let resume: Resume | null = null;
  for (const row of (progressResult.data ?? []) as ProgressRow[]) {
    const g = byId.get(row.guide_id);
    if (!g) continue;
    const next = g.parts.find((p) => !row.done?.[String(p.n)]);
    resume = { guideId: g.id, slug: g.slug, title: g.title, part: next ?? null };
    break;
  }

  return (
    <NotesHome
      initial={(notesResult.data ?? []) as Note[]}
      guides={guides}
      failed={!!notesResult.error || !!guidesResult.error}
      resume={resume}
    />
  );
}

export default function MyNotesPage() {
  return (
    <main id="main" className="mg">
      <div className="mg-wrap">
        <Suspense fallback={<p className="mg-loading">Loading your notes…</p>}>
          <Notes />
        </Suspense>
      </div>
    </main>
  );
}
