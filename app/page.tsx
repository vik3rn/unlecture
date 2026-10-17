import Link from "next/link";
import { Suspense } from "react";
import { LandingExamples } from "@/app/components/landing-examples";
import { getCurrentUser } from "@/lib/supabase/server";
import "./landing.css";

// Public landing page (grading contract in CLAUDE.md): what Unlecture does, who it is for, and ONE sign-up button
// to /signup. Logged-in students get "Go to my guides" there instead. The first screen puts the courses up front:
// a course list next to examples from the guides that flip every 5 seconds (app/components/landing-examples.tsx).
// "Your notes become your summary" explains the main feature (notes, /app) with a small summary preview.
// Styles live in landing.css, scoped to .lp, and the page fills wide screens (max 1440 px). Only the parts that
// depend on the login stream in (Suspense); the rest is static. No fixed exam date: students from several classes
// use the guides and add their own date. A new guide gets a course card with its slug (free preview for guests,
// "Open the guide" when logged in).

const steps = [
  { name: "Watch", text: "Short videos on the page. Pause at every stop sign and solve on paper.", warm: false },
  { name: "Remember", text: "The key points of each part, in a few lines.", warm: false },
  { name: "Quiz", text: "Questions in the real exam format, with an explanation for every option.", warm: false },
  { name: "Paper", text: "Worked exercises to solve by hand, then open the answer.", warm: true },
];

const notePoints = [
  { title: "Note the moment", text: "Press N while a video plays. The note keeps the time, so one click takes you back." },
  { title: "Mark what you don't get", text: "\u201cI don\u2019t understand this one\u201d on any quiz question, in one click." },
  { title: "One summary", text: "Before the exam: questions to clear up, key points and all your notes. Or a PDF." },
];

const keeps = [
  { title: "Parts done", text: "Ticks itself when a video ends" },
  { title: "Quiz answers", text: "Checked and explained" },
  { title: "Your score", text: "Know what to revisit" },
  { title: "Exam countdown", text: "From your own exam date" },
];

function SignupCta() {
  return (
    <div className="cta-row">
      <Link href="/signup" className="cta">
        Sign up free to track your progress
        <span aria-hidden="true" className="arr">
          →
        </span>
      </Link>
      <span className="cta-note">Just an email and a password.</span>
    </div>
  );
}

async function HeroCta() {
  const user = await getCurrentUser();
  if (!user) return <SignupCta />;
  return (
    <div className="cta-row">
      <Link href="/app/guides" className="cta">
        Go to my guides
        <span aria-hidden="true" className="arr">
          →
        </span>
      </Link>
      <span className="cta-note">You are logged in, and your progress is saved.</span>
    </div>
  );
}

function PreviewLink({ slug }: { slug: string }) {
  return (
    <Link href={`/guides/${slug}`} className="c-link">
      Preview Part 0 without signing up
    </Link>
  );
}

async function GuideAction({ slug }: { slug: string }) {
  const user = await getCurrentUser();
  if (!user) return <PreviewLink slug={slug} />;
  return (
    <Link href={`/app/guides/${slug}`} className="c-btn">
      Open the guide <span aria-hidden="true">→</span>
    </Link>
  );
}

export default function Home() {
  return (
    <main id="main" className="lp">
      <section className="hero" aria-labelledby="lp-title">
        <div className="wrap hero-grid">
          <div className="intro">
            <p className="pill">For IE BBA 3rd-year students with an exam coming up</p>
            <h1 id="lp-title">Exam guides for IE students</h1>
            <p className="lede">
              Each guide takes you through a course step by step before the exam: short videos on the page, the key
              points, exam-style quizzes and paper exercises.
            </p>

            <div className="courses" id="courses">
              <h2 className="eyebrow">Choose your course</h2>
              <article className="course">
                <div className="c-mark" aria-hidden="true">
                  DAE
                </div>
                <div className="c-body">
                  <div className="c-title">
                    <h3>Data Analysis for Economics</h3>
                    <span className="badge live">Live</span>
                  </div>
                  <p>Midterm · 15 parts · 108 exam-style questions · 54 paper exercises</p>
                </div>
                <div className="c-act">
                  <Suspense fallback={<PreviewLink slug="dae-midterm" />}>
                    <GuideAction slug="dae-midterm" />
                  </Suspense>
                </div>
              </article>
              <article className="course">
                <div className="c-mark" aria-hidden="true">
                  MC
                </div>
                <div className="c-body">
                  <div className="c-title">
                    <h3>Management Control</h3>
                    <span className="badge live">Live</span>
                  </div>
                  <p>Midterm · 17 parts · 90 exam-style questions · 4 timed mock exams</p>
                </div>
                <div className="c-act">
                  <Suspense fallback={<PreviewLink slug="management-control-midterm" />}>
                    <GuideAction slug="management-control-midterm" />
                  </Suspense>
                </div>
              </article>
            </div>

            <Suspense fallback={<SignupCta />}>
              <HeroCta />
            </Suspense>
          </div>
          <LandingExamples />
        </div>
      </section>

      <section className="band alt" id="how" aria-labelledby="how-title">
        <div className="wrap">
          <h2 id="how-title">How a guide works</h2>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s.name} className="step">
                <span className={s.warm ? "num warm" : "num"} aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band" aria-labelledby="notes-title">
        <div className="wrap notes-grid">
          <div className="text">
            <h2 id="notes-title">Your notes become your summary</h2>
            <p>Write down what you want to remember and what you still don&apos;t get, right where you study.</p>
            <ul className="note-points">
              {notePoints.map((n) => (
                <li key={n.title}>
                  <b>{n.title}</b>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* A picture of the summary page (decorative; the list above says the same in words). */}
          <div className="sum-card" aria-hidden="true">
            <span className="sc-cap">Summary of your notes</span>
            <span className="sc-title">Management Control</span>
            <div className="sc-q">
              <span className="no">1</span>
              <span>Why is production 6,000 and not 7,000?</span>
            </div>
            <div className="sc-q">
              <span className="no">2</span>
              <span>With idle capacity, is the opportunity cost zero?</span>
            </div>
            <div className="sc-n">
              <span className="at">4:28</span>
              <span>Production = sales + ending − beginning</span>
            </div>
            <div className="sc-n">
              <span className="at">9:05</span>
              <span>Cross-subsidy: big orders pay for the small ones</span>
            </div>
            <div className="sc-acts">
              <span className="primary">Export PDF</span>
              <span>Copy as text</span>
            </div>
          </div>
        </div>
      </section>

      <section className="band dark" aria-labelledby="keeps-title">
        <div className="wrap keeps-grid">
          <div>
            <h2 id="keeps-title">Your account keeps your progress</h2>
            <p>
              The parts you finish, every quiz answer, your score and your own exam date. Start on your laptop, carry
              on from your phone.
            </p>
          </div>
          <ul className="keeps">
            {keeps.map((k) => (
              <li key={k.title}>
                <b>{k.title}</b>
                <span>{k.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
