import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  themeColor: "#ffffff",
  colorScheme: "light",
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
          <div className="mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,72px)] py-6 text-sm text-muted">
            Unlecture is a student project and is not an official IE University product. Privacy: we store your email
            and your study progress to run the app, and the project owner can see them to improve the guides. We also
            store how long you study each day, per part (only the date, the part and the time), to show your progress
            and improve the guides. Page visits are counted anonymously with Vercel Web Analytics (no cookies).
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
