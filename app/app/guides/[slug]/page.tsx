import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { parseGuideContent, summarizeParts } from "@/lib/guides";
import { createClient } from "@/lib/supabase/server";
import { CourseOverview } from "./course-overview";

export const metadata: Metadata = { title: "Exam guide" };

// Course overview: all parts with the student's status, and where to continue.
async function Overview({ slug }: { slug: string }) {
  const supabase = await createClient();
  const { data: guide } = await supabase.from("guides").select("title, summary, content").eq("slug", slug).maybeSingle();
  if (!guide) notFound();
  const c = parseGuideContent(guide.content);
  return (
    <CourseOverview
      title={guide.title as string}
      summary={guide.summary as string}
      exam={c.exam}
      facts={c.facts}
      notOnSheet={c.notOnSheet}
      examDay={c.examDay}
      credit={c.credit}
      parts={summarizeParts(c)}
    />
  );
}

export default function GuidePage({ params }: PageProps<"/app/guides/[slug]">) {
  return (
    <Suspense fallback={<div className="dg"><p className="loading">Loading the guide…</p></div>}>
      {params.then(({ slug }) => (
        <Overview slug={slug} />
      ))}
    </Suspense>
  );
}
