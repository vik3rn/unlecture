import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CourseOverview } from "@/app/app/guides/[slug]/course-overview";
import { summarizeParts } from "@/lib/guides";
import { getPreview } from "@/lib/preview";
import { getCurrentUser } from "@/lib/supabase/server";

// Free preview of a guide's overview: the preview parts are open, the rest are locked. Logged-in users get the
// full guide instead.
export const metadata: Metadata = { title: "Free preview", robots: { index: false, follow: false } };

async function Preview({ slug }: { slug: string }) {
  if (await getCurrentUser()) redirect(`/app/guides/${slug}`);
  const guide = await getPreview(slug);
  if (!guide) {
    return (
      <div className="dg">
        <p className="loading">
          The free preview is not available right now. <Link href="/signup">Sign up free</Link> to open the guide.
        </p>
      </div>
    );
  }
  const c = guide.content;
  return (
    <CourseOverview
      title={guide.title}
      summary={guide.summary}
      exam={c.exam}
      facts={c.facts}
      notOnSheet={c.notOnSheet}
      examDay={c.examDay}
      credit={c.credit}
      parts={summarizeParts(c)}
    />
  );
}

export default function PreviewPage({ params }: PageProps<"/guides/[slug]">) {
  return (
    <Suspense fallback={<div className="dg"><p className="loading">Loading the preview…</p></div>}>
      {params.then(({ slug }) => (
        <Preview slug={slug} />
      ))}
    </Suspense>
  );
}
