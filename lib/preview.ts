import "server-only";
import { cacheLife } from "next/cache";
import { parseGuideContent, previewContent } from "@/lib/guides";
import { createAdminClient } from "@/lib/supabase/admin";

const SLUG = /^[a-z0-9-]{1,60}$/;

// The free preview of a guide: read on the server with the secret key, then cut down by previewContent so locked
// parts never reach the browser. Cached for a few minutes; it is the same for every visitor.
export async function getPreview(slug: string) {
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
