import "server-only";
import type { TimeRow } from "@/lib/guide-time";
import { parseGuideContent, plain, questionKeys, type GuideContent } from "@/lib/guides";
import type { AdminGuide, AdminPack, AdminProgressRow } from "@/lib/admin-metrics";
import { createAdminClient } from "@/lib/supabase/admin";

// Everything the admin pages read, with the server-only secret key (RLS does not apply to it). Only call this after
// checking isAdmin(): the result holds every student's email, progress and study time.

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
const PAGE = 1000;
const MAX_TIME_ROWS = 200_000;

// guide_time has one row per student, guide, day and part, so it can pass the API's row limit: read it in pages
// until a page comes back empty (works whatever the project's "max rows" is). missing = migration 0004 not run.
async function loadStudyTime(admin: Admin): Promise<{ rows: TimeRow[]; missing: boolean; error: string | null }> {
  const rows: TimeRow[] = [];
  while (rows.length < MAX_TIME_ROWS) {
    const { data, error } = await admin
      .from("guide_time")
      .select("user_id, guide_id, day, part, seconds")
      .order("user_id")
      .order("guide_id")
      .order("day")
      .order("part")
      .range(rows.length, rows.length + PAGE - 1);
    if (error) {
      const missing = error.code === "PGRST205" || error.code === "42P01";
      return { rows: [], missing, error: missing ? null : error.message };
    }
    if (!data?.length) break;
    rows.push(...(data as TimeRow[]));
  }
  return { rows, missing: false, error: null };
}

export type LoadedGuide = { id: string; slug: string; title: string; mark: string | null; content: GuideContent };

export async function loadAdminData() {
  const admin = createAdminClient();
  if (!admin) return { error: "The server key is not set (SUPABASE_SECRET_KEY)." as const };

  const [usersRes, guidesRes, progRes, time, packsRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("guides").select("id, slug, title, content, mark:content->>mark").order("created_at", { ascending: true }),
    admin.from("guide_progress").select("user_id, guide_id, progress, updated_at"),
    loadStudyTime(admin),
    admin.from("study_packs").select("title"),
  ]);
  const error = usersRes.error?.message ?? guidesRes.error?.message ?? progRes.error?.message;
  if (error) return { error: `Could not load the data: ${error}` };

  const guides: LoadedGuide[] = (guidesRes.data ?? []).map((g) => ({
    id: g.id as string,
    slug: g.slug as string,
    title: g.title as string,
    mark: (g.mark as string | null) ?? null,
    content: parseGuideContent(g.content),
  }));
  return {
    error: null,
    users: usersRes.data.users,
    guides,
    rows: (progRes.data ?? []) as AdminProgressRow[],
    time,
    packs: (packsRes.error ? [] : (packsRes.data ?? [])) as AdminPack[],
  };
}

// Short code for a guide: its `mark` from the seed, else the capitals of its title ("Management Control" → "MC").
export function guideMark(g: { title: string; mark: string | null }) {
  if (g.mark && /^[A-Za-z0-9]{1,4}$/.test(g.mark)) return g.mark;
  return g.title
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 3);
}

export function toAdminGuide(g: LoadedGuide): AdminGuide {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    mark: guideMark(g),
    single: g.content.format.correct === 1,
    parts: g.content.parts.map((p) => ({
      n: p.n,
      qs: questionKeys(p).map(({ q, key }) => ({ key, stem: plain(q.stem).slice(0, 110), correct: q.correct })),
    })),
  };
}
