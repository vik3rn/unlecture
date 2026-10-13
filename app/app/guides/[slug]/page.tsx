import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseGuideContent } from "@/lib/guides";
import type { GuideProgress } from "../actions";
import { GuideView } from "./guide-view";
import "./guide.css";

export const metadata: Metadata = { title: "Exam guide" };

async function GuideDetail({ slug }: { slug: string }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  // RLS: any logged-in user can read guides; progress rows are the user's own.
  const { data: guide } = await supabase
    .from("guides")
    .select("id, title, summary, content")
    .eq("slug", slug)
    .maybeSingle();
  if (!guide) notFound();

  const { data: row } = await supabase
    .from("guide_progress")
    .select("progress")
    .eq("guide_id", guide.id)
    .maybeSingle();

  return (
    <GuideView
      guideId={guide.id as string}
      title={guide.title as string}
      summary={guide.summary as string}
      content={parseGuideContent(guide.content)}
      initialProgress={(row?.progress ?? null) as GuideProgress | null}
    />
  );
}

export default function GuidePage({ params }: PageProps<"/app/guides/[slug]">) {
  return (
    <main id="main" className="flex-1">
      <Suspense
        fallback={
          <div className="dg">
            <p className="loading">Loading the guide…</p>
          </div>
        }
      >
        {params.then(({ slug }) => (
          <GuideDetail slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
