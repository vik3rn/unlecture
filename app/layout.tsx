import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SiteHeader } from "@/app/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Unlecture – exam guides for IE students",
    template: "%s · Unlecture",
  },
  description:
    "Unlecture exam guides take IE students through a course step by step before the exam: short videos, key points, exam-style quizzes and paper exercises.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f1a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <footer className="border-t border-line">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted">
            Unlecture is a student project and is not an official IE University product.
          </div>
        </footer>
      </body>
    </html>
  );
}
