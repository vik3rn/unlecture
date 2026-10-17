"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The two places of a logged-in student: My guides (/app/guides) and My notes (/app, the main feature). On a phone
// the tabs take their own row under the logo.
export function MainNav() {
  const path = usePathname();
  const notes = path === "/app" || path.startsWith("/app/notes");
  const guides = path.startsWith("/app/guides");
  return (
    <nav aria-label="Main" className="main-nav">
      <Link href="/app/guides" aria-current={guides ? "page" : undefined}>
        My guides
      </Link>
      <Link href="/app" aria-current={notes ? "page" : undefined}>
        My notes
      </Link>
    </nav>
  );
}
