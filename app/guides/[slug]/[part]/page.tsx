import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PartView } from "@/app/app/guides/[slug]/part-view";
import { plain } from "@/lib/guides";
import { getPreview } from "@/lib/preview";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Free preview", robots: { index: false, follow: false } };

// One open part of the free preview. Locked parts send the visitor back to the overview.
async function Part({ slug, n }: { slug: string; n: string }) {
  if (await getCurrentUser()) redirect(`/app/guides/${slug}/${n}`);
  const num = Number(n);
  if (!/^\d{1,3}$/.test(n)) notFound();
  const guide = await getPreview(slug);
  if (!guide) redirect(`/guides/${slug}`);
  const parts = guide.content.parts;
  const i = parts.findIndex((p) => p.n === num);
  if (i < 0) notFound();
  if (parts[i].locked) redirect(`/guides/${slug}`);
  const link = (j: number) => (parts[j] ? { n: parts[j].n, title: parts[j].title, locked: !!parts[j].locked } : null);
  return (
    <PartView
      part={parts[i]}
      prev={link(i - 1)}
      next={link(i + 1)}
      total={parts.length}
      last={parts.at(-1)?.n ?? 0}
      brand={plain(guide.content.brand) || plain(guide.title).split(":")[0]}
    />
  );
}

export default function PreviewPartPage({ params }: PageProps<"/guides/[slug]/[part]">) {
  return (
    <Suspense fallback={<div className="dg"><p className="loading">Loading the part…</p></div>}>
      {params.then(({ slug, part }) => (
        <Part slug={slug} n={part} />
      ))}
    </Suspense>
  );
}
