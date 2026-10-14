"use server";

import { redirect } from "next/navigation";
import { cleanProgress, LIMITS, progressBytes, type GuideProgress } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

export type { GuideProgress };

export type SaveResult = { error: string | null; tooLarge?: boolean };

// The shape check (clean) lives in lib/progress.ts so tests can run it: it accepts only the progress shape and
// drops everything else, because the client is never trusted.
export async function saveGuideProgress(guideId: string, progress: unknown): Promise<SaveResult> {
  if (typeof guideId !== "string" || !/^[0-9a-f-]{36}$/i.test(guideId)) return { error: "Unknown guide." };
  const value = cleanProgress(progress);
  if (!value) return { error: "Could not read your progress." };
  // The table refuses rows over 100,000 bytes; say so instead of failing like a lost connection.
  if (progressBytes(value) > LIMITS.bytes) {
    return { error: "Your answers are too long to save. Shorten an open answer.", tooLarge: true };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  // RLS makes sure a user can only write their own row.
  const { error } = await supabase
    .from("guide_progress")
    .upsert({ user_id: userId, guide_id: guideId, progress: value, updated_at: new Date().toISOString() });
  if (error) return { error: "Could not save your progress. Check your connection." };
  return { error: null };
}
