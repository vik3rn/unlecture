import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/supabase/server";
import "./landing.css";

// Public landing page (grading contract in CLAUDE.md): what Unlecture does, who it is for, and ONE sign-up button
// to /signup. Logged-in students get "Go to my guides" there instead. The first screen puts the courses up front:
// a course list next to an example of what a guide looks like. Styles live in landing.css, scoped to .lp, and the
// page fills wide screens (max 1440 px). Only the parts that depend on the login stream in (Suspense); the rest is
// static. No fixed exam date: students from several classes use the guides and add their own date.
// When the Management Control guide is live, give its card a "Live" badge and links like the DAE card.

const steps = [
  { name: "Watch", text: "Short videos on the page. Pause at every stop sign and solve on paper.", warm: false },
  { name: "Remember", text: "The key points of each part, in a few lines.", warm: false },
  { name: "Quiz", text: "Questions in the real exam format, with an explanation for every option.", warm: false },
  { name: "Paper", text: "Worked exercises to solve by hand, then open the answer.", warm: true },
];

const keeps = [
  { title: "Parts done", text: "Ticks itself when a video ends" },
  { title: "Quiz answers", text: "Checked and explained" },
  { title: "Your score", text: "Know what to revisit" },
  { title: "Exam countdown", text: "From your own exam date" },
];

const tableRows: { label: string; cells: string[]; total?: boolean }[] = [
  { label: "Sales", cells: ["4,000", "6,000", "5,000", "3,000", "18,000"] },
  { label: "+ Ending", cells: ["1,200", "?", "?", "?", "?"] },
  { label: "− Beginning", cells: ["800", "?", "?", "?", "?"] },
  { label: "Production", cells: ["4,400", "?", "?", "?", "?"], total: true },
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
      <Link href="/app" className="cta">
        Go to my guides
        <span aria-hidden="true" className="arr">
          →
        </span>
      </Link>
      <span className="cta-note">You are logged in, and your progress is saved.</span>
    </div>
  );
}

function PreviewLink() {
  return (
    <Link href="/guides/dae-midterm" className="c-link">
      Free preview: Part 0
    </Link>
  );
}

async function DaeAction() {
  const user = await getCurrentUser();
  if (!user) return <PreviewLink />;
  return (
    <Link href="/app/guides/dae-midterm" className="c-btn">
      Open the guide <span aria-hidden="true">→</span>
    </Link>
  );
}

function Collage() {
  return (
    <figure
      className="collage"
      role="img"
      aria-label="Example of a guide: a video part with a budget table and a stop sign to solve on paper, an exam-style quiz question and an exam countdown."
    >
      <div className="vid">
        <div className="vid-top">
          <span className="vid-tag">PART 9 · CHAPTER 4</span>
          <span className="vid-stop">
            <span className="stop">STOP</span>Pause &amp; solve on paper
          </span>
        </div>
        <div className="vid-body">
          <div className="vid-cap">Quarterly production budget</div>
          <div className="tbl">
            <span className="h" />
            <span className="h r">Q1</span>
            <span className="h r">Q2</span>
            <span className="h r">Q3</span>
            <span className="h r">Q4</span>
            <span className="h r yr">Year</span>
            {tableRows.map((row) => (
              <TableRow key={row.label} {...row} />
            ))}
          </div>
          <div className="vid-bar">
            <i />
            <span>6:51 / 10:58</span>
          </div>
        </div>
      </div>
      <div className="quiz">
        <div className="quiz-top">
          <span>Quiz · 4 options · 1 correct</span>
          <span className="pts">+0.5</span>
        </div>
        <p>Beginning 1,000 · sales 5,000 · target ending 2,000. Production?</p>
        <div className="opts">
          <span>A · 4,000</span>
          <span className="ok">B · 6,000 ✓</span>
          <span>C · 7,000</span>
          <span>D · None</span>
        </div>
      </div>
      <div className="exam">
        <div className="exam-cap">Your exam · example</div>
        <div className="exam-big">5 d 3 h</div>
        <div className="exam-bar">
          <i />
        </div>
        <div className="exam-note">6 of 15 parts done · progress saved</div>
      </div>
    </figure>
  );
}

function TableRow({ label, cells, total }: { label: string; cells: string[]; total?: boolean }) {
  return (
    <>
      <span className={total ? "l tot" : "l"}>{label}</span>
      {cells.map((c, i) => (
        <span
          key={i}
          className={["r", c === "?" ? "q" : "", i === 4 ? "yr" : "", total ? "tot" : ""].filter(Boolean).join(" ")}
        >
          {c}
        </span>
      ))}
    </>
  );
}

export default function Home() {
  return (
    <main id="main" className="lp">
      <section className="hero" aria-labelledby="lp-title">
        <div className="wrap hero-grid">
          <div className="intro">
            <p className="pill">For IE University students with an exam coming up</p>
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
                  <Suspense fallback={<PreviewLink />}>
                    <DaeAction />
                  </Suspense>
                </div>
              </article>
              <article className="course soon">
                <div className="c-mark" aria-hidden="true">
                  MC
                </div>
                <div className="c-body">
                  <div className="c-title">
                    <h3>Management Control</h3>
                    <span className="badge warm">Coming Friday 16 October</span>
                  </div>
                  <p>Midterm · 17 parts · worked cases · 4 timed mock exams</p>
                </div>
                <p className="c-soon">It appears in your account when it is published.</p>
              </article>
            </div>

            <Suspense fallback={<SignupCta />}>
              <HeroCta />
            </Suspense>
          </div>
          <Collage />
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
