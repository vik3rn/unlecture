import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { parseGuideContent, plain } from "@/lib/guides";
import { createClient } from "@/lib/supabase/server";
import { MockExam } from "../../mock-exam";

export const metadata: Metadata = { title: "Mock exam" };

// A timed mock exam (logged-in only: /app is behind the login, and the attempt lives in the progress row).
async function Mock({ slug, id }: { slug: string; id: string }) {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: guide } = await supabase.from("guides").select("title, content").eq("slug", slug).maybeSingle();
  if (!guide) notFound();
  const c = parseGuideContent(guide.content);
  const mock = c.mocks.find((m) => m.id === id);
  if (!mock) notFound();
  const part = mock.video ? c.parts.find((p) => p.slug === mock.video) : undefined;
  return (
    <MockExam
      mock={mock}
      format={c.format}
      walkthrough={part ? { n: part.n, title: part.title } : null}
      brand={plain(c.brand) || plain(guide.title as string).split(":")[0]}
    />
  );
}

export default function MockPage({ params }: PageProps<"/app/guides/[slug]/mock/[id]">) {
  return (
    <Suspense fallback={<div className="dg"><p className="loading">Loading the mock exam…</p></div>}>
      {params.then(({ slug, id }) => (
        <Mock slug={slug} id={id} />
      ))}
    </Suspense>
  );
}
