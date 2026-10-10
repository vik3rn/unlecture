import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { deleteStudyPack } from "./actions";
import { NewPackForm } from "./new-pack-form";

export const metadata: Metadata = { title: "Your study packs" };

type StudyPack = { id: string; title: string; created_at: string };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

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
        Could not load your study packs: {error.message}
      </p>
    );
  }

  const packs = (data ?? []) as StudyPack[];

  if (packs.length === 0) {
    return (
      <div className="card border-dashed p-6 text-center text-muted">
        No study packs yet. Add the first topic you want to finally get.
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Your study packs">
      {packs.map((pack) => (
        <li
          key={pack.id}
          data-testid="core-item"
          className="card flex items-start justify-between gap-3 p-4"
        >
          <div className="min-w-0">
            <p className="font-medium break-words">{pack.title}</p>
            <p className="mt-1 text-sm text-muted">
              Added {dateFormat.format(new Date(pack.created_at))} · Video coming soon
            </p>
          </div>
          <form action={deleteStudyPack}>
            <input type="hidden" name="id" value={pack.id} />
            <button
              type="submit"
              className="btn-ghost shrink-0 text-sm"
              aria-label={`Delete study pack “${pack.title}”`}
            >
              Delete
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default function AppPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your study packs</h1>
      <p className="mt-2 text-muted">
        One pack per topic you&rsquo;re stuck on. Soon you&rsquo;ll turn each one into an explainer video.
      </p>

      <div className="mt-6">
        <NewPackForm />
      </div>

      <section className="mt-8" aria-labelledby="packs-heading">
        <h2 id="packs-heading" className="sr-only">Saved study packs</h2>
        <Suspense fallback={<p className="text-muted">Loading your study packs…</p>}>
          <StudyPackList />
        </Suspense>
      </section>
    </main>
  );
}
