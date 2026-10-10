import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/supabase/server";

async function AuthNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/login" className="btn-ghost">
        Log in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/app" className="btn-ghost">
        My packs
      </Link>
      <form action={logout}>
        <button type="submit" data-testid="logout" className="btn-secondary">
          Log out
        </button>
      </form>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-accent text-accent-ink">
            ▶
          </span>
          Unlecture
        </Link>
        <Suspense fallback={<span className="h-11" aria-hidden="true" />}>
          <AuthNav />
        </Suspense>
      </div>
    </header>
  );
}
