import type { NextRequest } from "next/server";
import { parseGuideContent, previewContent } from "@/lib/guides";
import { presignGet } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /api/video?guide=<slug>&part=<n> → { url } : a 6-hour link to that part's video in the private R2 bucket.
// Logged-in users get any part of a guide they can read (RLS decides). Visitors without an account only get
// the parts that are open in the free preview. The video itself streams from R2, never through this route.
const SLUG = /^[a-z0-9-]{1,60}$/;
const LINK_SECONDS = 6 * 60 * 60;

const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("guide") ?? "";
  const part = Number(request.nextUrl.searchParams.get("part"));
  if (!SLUG.test(slug) || !Number.isInteger(part) || part < 0 || part > 200) return json({ error: "Bad request." }, 400);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const loggedIn = Boolean(auth?.claims?.sub);

  let content = null;
  if (loggedIn) {
    const { data } = await supabase.from("guides").select("content").eq("slug", slug).maybeSingle();
    if (data) content = parseGuideContent(data.content);
  } else {
    const admin = createAdminClient();
    const { data } = admin ? await admin.from("guides").select("content").eq("slug", slug).maybeSingle() : { data: null };
    if (data) content = previewContent(parseGuideContent(data.content));
  }

  const file = content?.parts.find((p) => p.n === part)?.file;
  if (!file) return json({ error: loggedIn ? "No video for this part." : "Sign up to watch this part." }, loggedIn ? 404 : 401);

  const url = presignGet(file, LINK_SECONDS);
  if (!url) return json({ error: "Video storage is not set up." }, 503);
  return json({ url });
}
