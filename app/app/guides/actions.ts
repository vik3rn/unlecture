"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type GuideProgress = {
  // part number → marked done
  done: Record<string, boolean>;
  // question key → the two letters the user picked
  quiz: Record<string, string[]>;
  // the student's own exam for this course: local date and time in an IANA time zone
  exam?: { date: string; time: string; tz: string };
};

const KEY = /^[0-9a-z-]{1,24}$/i;
const LETTERS = new Set(["A", "B", "C", "D", "E", "F"]);
const MAX_KEYS = 600;

function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Accepts only the shape above (the client is never trusted).
function clean(input: unknown): GuideProgress | null {
  if (!input || typeof input !== "object") return null;
  const { done, quiz, exam } = input as { done?: unknown; quiz?: unknown; exam?: unknown };
  const out: GuideProgress = { done: {}, quiz: {} };
  if (done && typeof done === "object") {
    for (const [k, v] of Object.entries(done).slice(0, MAX_KEYS)) {
      if (KEY.test(k) && v === true) out.done[k] = true;
    }
  }
  if (quiz && typeof quiz === "object") {
    for (const [k, v] of Object.entries(quiz).slice(0, MAX_KEYS)) {
      if (!KEY.test(k) || !Array.isArray(v) || v.length !== 2) continue;
      const picks = v.filter((x): x is string => typeof x === "string" && LETTERS.has(x));
      if (picks.length === 2 && picks[0] !== picks[1]) out.quiz[k] = picks;
    }
  }
  if (exam && typeof exam === "object") {
    const { date, time, tz } = exam as { date?: unknown; time?: unknown; tz?: unknown };
    if (
      typeof date === "string" && /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) &&
      typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) &&
      typeof tz === "string" && tz.length <= 64 && /^[A-Za-z_+\-/0-9]+$/.test(tz) && validZone(tz)
    ) {
      out.exam = { date, time, tz };
    }
  }
  return out;
}

export async function saveGuideProgress(guideId: string, progress: unknown): Promise<{ error: string | null }> {
  if (typeof guideId !== "string" || !/^[0-9a-f-]{36}$/i.test(guideId)) return { error: "Unknown guide." };
  const value = clean(progress);
  if (!value) return { error: "Could not read your progress." };

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
