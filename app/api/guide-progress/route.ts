import type { NextRequest } from "next/server";
import { cleanProgress } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

// GET /api/guide-progress?guide=<guide id> → { progress } : the logged-in student's own saved progress in a guide
// (null when nothing is saved yet). The guide layout (progress.tsx) reads it when a tab comes back into view, so a
// tab left open does not overwrite what the student did in another tab or on another device. Read-only, own row
// only (RLS and the user filter), never cached. A Route Handler, not a Server Action: actions run one at a time and
// would wait behind the saves.
const GUIDE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const guideId = request.nextUrl.searchParams.get("guide") ?? "";
  if (!GUIDE_ID.test(guideId)) return json({ error: "Bad request." }, 400);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return json({ error: "Log in first." }, 401);

  const { data, error } = await supabase
    .from("guide_progress")
    .select("progress")
    .eq("guide_id", guideId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return json({ error: "Could not load your progress." }, 500);
  return json({ progress: data ? cleanProgress(data.progress) : null });
}
