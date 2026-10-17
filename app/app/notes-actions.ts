"use server";

import { revalidatePath } from "next/cache";
import { cleanNote, NOTE_COLUMNS, type Note } from "@/lib/notes";
import { createClient } from "@/lib/supabase/server";

// Saving and deleting notes for the exam. RLS (public.notes) keeps every note to its owner; saving never calls an
// AI API. /app is refreshed so the list of all notes shows the change.

export type SaveNoteResult = { note: Note; error: null } | { note: null; error: string };

export async function saveNote(input: unknown): Promise<SaveNoteResult> {
  const clean = cleanNote(input);
  if ("error" in clean) return { note: null, error: clean.error };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { note: null, error: "Log in again to save notes." };

  const { data, error } = await supabase
    .from("notes")
    .insert({ ...clean.row, user_id: userId })
    .select(NOTE_COLUMNS)
    .single();
  if (error || !data) return { note: null, error: `Could not save it: ${error?.message ?? "unknown error"}` };
  revalidatePath("/app");
  return { note: data as Note, error: null };
}

export async function deleteNote(id: string): Promise<{ error: string | null }> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Unknown note." };
  const supabase = await createClient();
  // RLS makes sure a user can only delete their own notes.
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return { error: `Could not delete it: ${error.message}` };
  revalidatePath("/app");
  return { error: null };
}
