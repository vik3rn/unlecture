import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";
import "./admin.css";

// Shell of the owner-only pages: a sidebar (Overview, Students, Guides and questions, Traffic) and the page. The
// shell holds no data; every page checks ADMIN_EMAILS itself before it loads anything, and nothing is indexed.
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
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
          <b>Confidential</b>
          Student emails and progress. Do not share these pages or copy the lists anywhere else.
        </div>
      </aside>
      <main id="main" className="ad-main">
        {children}
      </main>
    </div>
  );
}
