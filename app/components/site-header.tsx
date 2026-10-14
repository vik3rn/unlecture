import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { LogoMark } from "@/app/components/logo";
import { isAdmin } from "@/lib/admin";
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
      {isAdmin(user.email) && (
        <Link href="/app/admin" className="btn-ghost">
          Admin
        </Link>
      )}
      <Link href="/app" className="btn-ghost">
        My guides
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
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-3 px-[clamp(20px,4vw,72px)]">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <LogoMark size={32} />
          Unlecture
        </Link>
        <Suspense fallback={<span className="h-11" aria-hidden="true" />}>
          <AuthNav />
        </Suspense>
      </div>
    </header>
  );
}
