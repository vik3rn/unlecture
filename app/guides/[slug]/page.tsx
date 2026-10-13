import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GuideView } from "@/app/app/guides/[slug]/guide-view";
import { parseGuideContent, previewContent } from "@/lib/guides";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import "@/app/app/guides/[slug]/guide.css";

// Free preview of a guide without an account. Nothing is saved here; logged-in users get the full guide.
export const metadata: Metadata = {
  title: "Free preview",
  robots: { index: false, follow: false },
};

const SLUG = /^[a-z0-9-]{1,60}$/;

// Cached for a few minutes: the same preview for every visitor, read with the server-only secret key.
// Only the preview parts survive previewContent, so locked parts never reach the browser.
async function getPreview(slug: string) {
  "use cache";
  cacheLife("minutes");
  const admin = createAdminClient();
  if (!admin || !SLUG.test(slug)) return null;
  const { data } = await admin.from("guides").select("title, summary, content").eq("slug", slug).maybeSingle();
  if (!data) return null;
  return {
    title: data.title as string,
    summary: data.summary as string,
    content: previewContent(parseGuideContent(data.content)),
  };
}

async function Preview({ slug }: { slug: string }) {
  if (await getCurrentUser()) redirect(`/app/guides/${slug}`);
  const guide = await getPreview(slug);
  if (!guide) {
    return (
      <p className="loading">
        The free preview is not available right now. <Link href="/signup">Sign up free</Link> to open the guide.
      </p>
    );
  }
  return (
    <GuideView
      guest
      slug={slug}
      guideId=""
      title={guide.title}
      summary={guide.summary}
      content={guide.content}
      initialProgress={null}
    />
  );
}

export default function GuidePreviewPage({ params }: PageProps<"/guides/[slug]">) {
  return (
    <main id="main" className="flex-1">
      <div className="dg">
        <Suspense fallback={<p className="loading">Loading the preview…</p>}>
          {params.then(({ slug }) => (
            <Preview slug={slug} />
          ))}
        </Suspense>
      </div>
    </main>
  );
}
