import type { NextRequest } from "next/server";
import { parseGuideTimeBody } from "@/lib/guide-time";
import { createClient } from "@/lib/supabase/server";

// POST /api/guide-time {guideId | slug, part, seconds} → 204. Adds active study time for the logged-in student
// (sent by app/app/guides/[slug]/study-timer.tsx). Runs as the student with the publishable key only: the database
// function add_guide_time takes the user from the login, clamps the seconds and writes nothing else.
const MAX_BODY = 512;
const NOT_SET_UP = new Set(["PGRST202", "PGRST205", "42883", "42P01", "42501"]);

const reply = (status: number, error?: string) =>
  error
    ? Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } })
    : new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return reply(401, "Log in first.");

  // JSON only: a cross-site form or plain-text post cannot reach this without a CORS preflight.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply(400, "Bad request.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return reply(400, "Bad request.");
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return reply(400, "Bad request.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, "Bad request.");
  }
  const input = parseGuideTimeBody(body);
  if (!input) return reply(400, "Bad request.");

  let guideId: string;
  if ("id" in input.guide) {
    guideId = input.guide.id;
  } else {
    // RLS: any logged-in user can read guides.
    const { data } = await supabase.from("guides").select("id").eq("slug", input.guide.slug).maybeSingle();
    if (!data) return reply(400, "Unknown guide.");
    guideId = data.id as string;
  }

  const { error } = await supabase.rpc("add_guide_time", { p_guide: guideId, p_part: input.part, p_seconds: input.seconds });
  if (error) {
    // 23503: no such guide. 22023: rejected by the function.
    if (error.code === "23503" || error.code === "22023") return reply(400, "Bad request.");
    if (error.code === "28000") return reply(401, "Log in first."); // the function saw no logged-in user
    // Migration 0004 not run yet (or its grants missing): the tracker stops sending on 503.
    if (NOT_SET_UP.has(error.code)) return reply(503, "Study time is not set up yet.");
    return reply(500, "Could not save study time.");
  }
  return reply(204);
}
