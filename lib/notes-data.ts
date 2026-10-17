import { redirect } from "next/navigation";
import { NOTE_COLUMNS, type Note } from "@/lib/notes";
import { createClient } from "@/lib/supabase/server";

// What the summary and the PDF of the notes need: the logged-in student's notes (for one course with ?guide=<id>,
// else all) and the guides with their part titles. RLS keeps the notes to their owner; guides are readable by
// every logged-in user.

export type NotesCourse = { id: string; slug: string; title: string; parts: { n: number; title: string }[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function outlineOf(v: unknown) {
  return Array.isArray(v)
    ? v
        .filter((o): o is { n: number; title: string } => !!o && Number.isInteger(o.n) && typeof o.title === "string")
        .map((o) => ({ n: o.n, title: o.title.slice(0, 200) }))
    : [];
}

export async function loadNotes(guide: string | undefined) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  const one = guide && UUID.test(guide) ? guide.toLowerCase() : null;
  let query = supabase.from("notes").select(NOTE_COLUMNS).order("created_at", { ascending: true }).limit(1000);
  if (one) query = query.eq("guide_id", one);
  const [notesResult, guidesResult] = await Promise.all([
    query,
    supabase.from("guides").select("id, slug, title, outline:content->outline").order("created_at", { ascending: true }),
  ]);
  const courses: NotesCourse[] = ((guidesResult.data ?? []) as { id: string; slug: string; title: string; outline: unknown }[]).map(
    (g) => ({ id: g.id, slug: g.slug, title: g.title, parts: outlineOf(g.outline) }),
  );
  const notes = (notesResult.data ?? []) as Note[];
  // Only courses that have notes, in the order of the guides; one course when ?guide= names one.
  const withNotes = courses.filter((c) => notes.some((n) => n.guide_id === c.id));
  return {
    failed: !!notesResult.error || !!guidesResult.error,
    one,
    courses: withNotes,
    notesOf: (id: string) => notes.filter((n) => n.guide_id === id),
  };
}
