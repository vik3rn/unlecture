import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { GuideProgress } from "../actions";
import { ProgressProvider } from "./progress";
import "./guide.css";

// Loads the student's progress once for the whole guide (overview and every part page), so it stays in memory
// while they move between pages. RLS: the progress row is the student's own.
async function WithProgress({ slug, children }: { slug: string; children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  const { data: guide } = await supabase.from("guides").select("id").eq("slug", slug).maybeSingle();
  if (!guide) notFound();
  const { data: row } = await supabase.from("guide_progress").select("progress").eq("guide_id", guide.id).maybeSingle();

  return (
    <ProgressProvider slug={slug} guideId={guide.id as string} guest={false} initial={(row?.progress ?? null) as GuideProgress | null}>
      {children}
    </ProgressProvider>
  );
}

export default function GuideLayout({ params, children }: LayoutProps<"/app/guides/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="dg">
          <p className="loading">Loading the guide…</p>
        </div>
      }
    >
      {params.then(({ slug }) => (
        <WithProgress slug={slug}>{children}</WithProgress>
      ))}
    </Suspense>
  );
}
