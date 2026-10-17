import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { AdminNav } from "./admin-nav";
import "./admin.css";

// Shell of the owner-only pages: a sidebar (Overview, Students, Guides and questions, Traffic) and the page. The
// pages show personal data, so the shell renders only for ADMIN_EMAILS (each page checks again) and is never indexed.
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

async function AdminShell({ children }: { children: ReactNode }) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me.email)) notFound();
  return (
    <div className="ad">
      <aside className="ad-side" aria-label="Admin">
        <div className="ad-brand">
          <span className="ad-brand-mark" aria-hidden="true">
            U
          </span>
          <div>
            <b>Unlecture</b>
            <small>Admin</small>
          </div>
        </div>
        <AdminNav />
        <div className="ad-side-note">
          <b>Emails hidden</b>
          Students show as short IDs. Show emails only when you need to contact someone.
        </div>
      </aside>
      <main id="main" className="ad-main">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/app/admin">) {
  return (
    <Suspense
      fallback={
        <div className="ad">
          <p className="ad-loading">Loading…</p>
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
