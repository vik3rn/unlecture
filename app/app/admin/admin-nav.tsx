"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sidebar links of the admin pages; the current page gets aria-current. Traffic opens Vercel Web Analytics.
const icon = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  students: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.9.7 3.1 2.5 3.5 5.5" />
    </>
  ),
  guides: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20" />
    </>
  ),
  traffic: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
};

function Icon({ name }: { name: keyof typeof icon }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon[name]}
    </svg>
  );
}

const learning = [
  { href: "/app/admin", label: "Overview", icon: "overview" },
  { href: "/app/admin/students", label: "Students", icon: "students" },
  { href: "/app/admin/guides", label: "Guides and questions", icon: "guides" },
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="ad-nav" aria-label="Admin sections">
      <div className="ad-nav-group">
        <span className="ad-nav-label">Learning</span>
        {learning.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
            <Icon name={l.icon} />
            {l.label}
          </Link>
        ))}
      </div>
      <div className="ad-nav-group">
        <span className="ad-nav-label">Growth</span>
        <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">
          <Icon name="traffic" />
          Traffic
          <span className="ext">Vercel ↗</span>
        </a>
      </div>
    </nav>
  );
}
