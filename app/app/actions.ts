"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreatePackState = { error: string | null };

const MAX_TITLE_LENGTH = 200;

export async function createStudyPack(
  _prev: CreatePackState,
  formData: FormData,
): Promise<CreatePackState> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Type a course or topic first." };
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Keep it under ${MAX_TITLE_LENGTH} characters.` };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  // Saving to the study list never calls an AI API.
  const { error } = await supabase.from("study_packs").insert({ title, user_id: userId });
  if (error) return { error: `Could not save it: ${error.message}` };

  revalidatePath("/app");
  return { error: null };
}

export async function deleteStudyPack(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // RLS makes sure a user can only delete their own packs.
  await supabase.from("study_packs").delete().eq("id", id);
  revalidatePath("/app");
}
