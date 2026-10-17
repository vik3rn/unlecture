import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { parseGuideContent, plain } from "@/lib/guides";
import { NOTE_COLUMNS, type Note } from "@/lib/notes";
import { createClient } from "@/lib/supabase/server";
import { PartView } from "../part-view";

export const metadata: Metadata = { title: "Exam guide" };

// One part of a guide: video, key points, quiz and exercises, with previous/next, and the student's notes for the
// whole course (the panel shows this part first). ?t=<seconds> (from a note) starts the video at that moment.
async function Part({ slug, n, t }: { slug: string; n: string; t: string | string[] | undefined }) {
  const num = Number(n);
  if (!/^\d{1,3}$/.test(n) || !Number.isInteger(num)) notFound();
  const supabase = await createClient();
  const { data: guide } = await supabase.from("guides").select("id, title, content").eq("slug", slug).maybeSingle();
  if (!guide) notFound();
  const c = parseGuideContent(guide.content);
  const i = c.parts.findIndex((p) => p.n === num);
  if (i < 0) notFound();
  // RLS returns only the student's own notes.
  const { data: notes } = await supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("guide_id", guide.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  const startAt = typeof t === "string" && /^\d{1,5}$/.test(t) ? Math.min(36000, Number(t)) : null;
  const link = (j: number) => (c.parts[j] ? { n: c.parts[j].n, title: c.parts[j].title, locked: false } : null);
  return (
    <PartView
      part={c.parts[i]}
      prev={link(i - 1)}
      next={link(i + 1)}
      total={c.parts.length}
      last={c.parts.at(-1)?.n ?? 0}
      brand={plain(c.brand) || plain(guide.title as string).split(":")[0]}
      format={c.format}
      notes={{
        guideId: guide.id as string,
        items: (notes ?? []) as Note[],
        parts: c.parts.map((p) => ({ n: p.n, title: plain(p.title) })),
      }}
      startAt={startAt}
    />
  );
}

export default function PartPage({ params, searchParams }: PageProps<"/app/guides/[slug]/[part]">) {
  return (
    <Suspense fallback={<div className="dg"><p className="loading">Loading the part…</p></div>}>
      {Promise.all([params, searchParams]).then(([{ slug, part }, { t }]) => (
        <Part slug={slug} n={part} t={t} />
      ))}
    </Suspense>
  );
}
