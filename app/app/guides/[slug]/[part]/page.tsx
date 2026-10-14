import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { parseGuideContent, plain } from "@/lib/guides";
import { createClient } from "@/lib/supabase/server";
import { PartView } from "../part-view";

export const metadata: Metadata = { title: "Exam guide" };

// One part of a guide: video, key points, quiz and exercises, with previous/next.
async function Part({ slug, n }: { slug: string; n: string }) {
  const num = Number(n);
  if (!/^\d{1,3}$/.test(n) || !Number.isInteger(num)) notFound();
  const supabase = await createClient();
  const { data: guide } = await supabase.from("guides").select("title, content").eq("slug", slug).maybeSingle();
  if (!guide) notFound();
  const c = parseGuideContent(guide.content);
  const i = c.parts.findIndex((p) => p.n === num);
  if (i < 0) notFound();
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
    />
  );
}

export default function PartPage({ params }: PageProps<"/app/guides/[slug]/[part]">) {
  return (
    <Suspense fallback={<div className="dg"><p className="loading">Loading the part…</p></div>}>
      {params.then(({ slug, part }) => (
        <Part slug={slug} n={part} />
      ))}
    </Suspense>
  );
}
