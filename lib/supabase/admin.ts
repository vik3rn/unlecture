import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client with the secret key. It bypasses RLS, so it is used for exactly one thing:
// reading a guide for the public free preview, which strips every part except the preview ones before
// anything leaves the server (see lib/guides.ts previewContent). Never import this from a Client Component.
// The key lives only in Vercel's environment variables (SUPABASE_SECRET_KEY), never in the browser or on GitHub.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
