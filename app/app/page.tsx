import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { deleteStudyPack } from "./actions";
import { NewPackForm } from "./new-pack-form";

export const metadata: Metadata = { title: "Your exam guides" };

type StudyPack = { id: string; title: string; created_at: string };
type Guide = { id: string; slug: string; title: string; summary: string; part_count: number; exam_at: string | null };
type ProgressRow = { guide_id: string; done: Record<string, boolean> | null };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const examFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

async function GuideList() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  // RLS: every logged-in user can read guides; progress rows are the user's own.
  const [guidesResult, progressResult] = await Promise.all([
    supabase
      .from("guides")
      .select("id, slug, title, summary, part_count, exam_at")
      .order("exam_at", { ascending: true, nullsFirst: false }),
    supabase.from("guide_progress").select("guide_id, done:progress->done"),
  ]);

  if (guidesResult.error) {
    return (
      <div className="card border-dashed p-6 text-center text-muted">
        The exam guides could not be loaded right now. Please try again in a moment.
      </div>
    );
  }

  const guides = (guidesResult.data ?? []) as Guide[];
  const doneByGuide = new Map(
    ((progressResult.data ?? []) as ProgressRow[]).map((r) => [r.guide_id, Object.keys(r.done ?? {}).length]),
  );

  if (guides.length === 0) {
    return (
      <div className="card border-dashed p-6 text-center text-muted">
        No exam guides yet. New guides show up here as soon as they are published.
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Exam guides">
      {guides.map((guide) => {
        const done = Math.min(doneByGuide.get(guide.id) ?? 0, guide.part_count);
        const pct = guide.part_count ? Math.round((100 * done) / guide.part_count) : 0;
        return (
          <li key={guide.id}>
            <Link
              href={`/app/guides/${guide.slug}`}
              className="card flex h-full flex-col p-5 transition-colors hover:border-accent"
            >
              <span className="text-lg font-semibold">{guide.title}</span>
              {guide.summary && <span className="mt-1 text-sm text-muted">{guide.summary}</span>}
              {guide.exam_at && (
                <span className="mt-3 text-sm font-semibold text-warn">
                  Exam {examFormat.format(new Date(guide.exam_at))}
                </span>
              )}
              <span className="mt-auto pt-4">
                <span className="block h-2 overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
                  <span className="block h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                </span>
                <span className="mt-2 block text-sm text-muted">
                  {done} of {guide.part_count} parts done
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function StudyPackList() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  const { data, error } = await supabase
    .from("study_packs")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p role="alert" className="text-danger">
        Could not load your study list: {error.message}
      </p>
    );
  }

  const packs = (data ?? []) as StudyPack[];

  if (packs.length === 0) {
    return (
      <div className="card border-dashed p-6 text-center text-muted">
        Nothing on your list yet. Add the first course or topic you need to study.
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Your study list">
      {packs.map((pack) => (
        <li
          key={pack.id}
          data-testid="core-item"
          className="card flex items-start justify-between gap-3 p-4"
        >
          <div className="min-w-0">
            <p className="font-medium break-words">{pack.title}</p>
            <p className="mt-1 text-sm text-muted">Added {dateFormat.format(new Date(pack.created_at))}</p>
          </div>
          <form action={deleteStudyPack}>
            <input type="hidden" name="id" value={pack.id} />
            <button
              type="submit"
              className="btn-ghost shrink-0 text-sm"
              aria-label={`Remove “${pack.title}” from your list`}
            >
              Remove
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default function AppPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your exam guides</h1>
      <p className="mt-2 text-muted">
        Each guide takes you through a course step by step: short videos, key points, exam-style quizzes and paper
        exercises. Your progress is saved to your account.
      </p>

      <section className="mt-6" aria-labelledby="guides-heading">
        <h2 id="guides-heading" className="sr-only">
          Exam guides
        </h2>
        <Suspense fallback={<p className="text-muted">Loading the guides…</p>}>
          <GuideList />
        </Suspense>
      </section>

      <section className="mt-12" aria-labelledby="list-heading">
        <h2 id="list-heading" className="text-xl font-semibold tracking-tight">
          Your study list
        </h2>
        <div className="mt-4">
          <NewPackForm />
        </div>
        <div className="mt-6">
          <Suspense fallback={<p className="text-muted">Loading your study list…</p>}>
            <StudyPackList />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
