import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isAdmin } from "@/lib/admin";
import { loadAdminData, toAdminGuide } from "@/lib/admin-data";
import { computeOverview } from "@/lib/admin-metrics";
import { dayIn } from "@/lib/guide-time";
import { getCurrentUser } from "@/lib/supabase/server";
import { OverviewBody } from "./overview-body";

// Admin overview (owner only): five numbers for the chosen period compared with the period before, active students
// per day, what needs attention, the path from sign-up to mock exam, weekly sign-up cohorts and one card per guide.
// Numbers only, no emails. Definitions sit under each number; the maths is in lib/admin-metrics.ts.
export const metadata: Metadata = { title: "Admin overview", robots: { index: false, follow: false } };

// Time-dependent helpers live outside the components (components must stay pure).
function now() {
  return new Date();
}

async function OverviewView({ searchParams }: { searchParams: PageProps<"/app/admin">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me.email)) notFound();
  const sp = await searchParams;
  const range = sp.range === "30" ? 30 : 7;

  const data = await loadAdminData();
  if (data.error !== null) {
    return (
      <p role="alert" className="ad-error">
        {data.error}
      </p>
    );
  }
  const at = now();
  const o = computeOverview({
    today: dayIn(at),
    range,
    users: data.users,
    rows: data.rows,
    time: data.time.rows,
    guides: data.guides.map(toAdminGuide),
    packs: data.packs,
    toDay: (iso) => dayIn(new Date(iso)),
  });
  return <OverviewBody o={o} range={range} updatedAt={at} timeMissing={data.time.missing} timeError={data.time.error} />;
}

export default function AdminPage({ searchParams }: PageProps<"/app/admin">) {
  return (
    <Suspense fallback={<p className="ad-loading">Loading the numbers…</p>}>
      <OverviewView searchParams={searchParams} />
    </Suspense>
  );
}
