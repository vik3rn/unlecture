import Link from "next/link";
import "./landing.css";

// Public landing page (grading contract in CLAUDE.md): what Unlecture does, who it is for, and ONE sign-up button
// to /signup. The copy makes clear what the account is for: it keeps each student's progress in the guides.
// A static server component with no client JS. Styles live in landing.css, scoped to .lp, in the look of the
// original offline study guide (see app/app/guides/[slug]/guide.css).
// The guide facts below come from the DAE midterm guide. Update them when the guides change, and drop the exam
// chip after Fri 16 Oct 2026.

// Example progress for the preview card. The page labels it as an example; the part titles are the real ones.
const previewParts = [
  { n: 4, title: "Random variables and the rules for E and Var", state: "done" },
  { n: 5, title: "Estimators: bias, efficiency and MSE", state: "done" },
  { n: 6, title: "The simple regression model and its assumptions", state: "todo" },
  { n: 7, title: "OLS: finding the line", state: "todo" },
  { n: 8, title: "Residuals, sums of squares and R²", state: "todo" },
] as const;

const saves = [
  {
    icon: "✓",
    tone: "ok",
    title: "The parts you finish",
    body: "Tick a part when you are done, or watch its video to the end and it ticks itself. You always see what is left.",
  },
  {
    icon: "AB",
    tone: "accent",
    title: "Your quiz answers",
    body: "The two options you picked on each question stay checked and explained when you come back.",
  },
  {
    icon: "%",
    tone: "accent",
    title: "Your score",
    body: "Your marks on every question you have checked, so you know which ones to go back to before the exam.",
  },
  {
    icon: "⇄",
    tone: "warm",
    title: "Every device",
    body: "Start on your laptop, carry on from your phone. Log in and your ticks, answers and score are all there.",
  },
];

// The four steps as the study guide shows them.
const steps = [
  { name: "Watch", text: "Short videos on the page, with more on the way. Pause at every stop sign and solve on paper." },
  { name: "Remember", text: "Read the key points under the video." },
  { name: "Quiz", text: "Pick TWO of six, then check. Explanations for every option." },
  { name: "Paper", text: "Solve the exercises by hand, then open the answer." },
];

const examFacts = ["On paper · 70 min", "6 options · 2 correct · no penalty", "Formula sheet + basic calculator", "Units I and II · 35 %"];

function LockIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ProgressPreview() {
  return (
    <figure className="preview">
      <div className="stack">
        <div
          className="dash"
          role="img"
          aria-label="Example of saved progress in a guide: 6 of 15 parts done, 40 of 108 questions answered, 66 of 80 marks, progress saved."
        >
          <div className="dash-head">
            <span className="dash-brand">DAE Midterm · Study guide</span>
            <span className="chip">Example</span>
          </div>
          <div className="dash-bar">
            <i />
          </div>
          <div className="dash-stats">
            <div>
              <b>6/15</b>
              <span>parts done</span>
            </div>
            <div>
              <b>40/108</b>
              <span>questions answered</span>
            </div>
            <div className="score">
              <b>66/80</b>
              <span>quiz marks</span>
            </div>
          </div>
          <ul className="dash-parts">
            {previewParts.map((p) => (
              <li key={p.n} className={p.state}>
                <span className="n">{p.n}</span>
                <span className="t">{p.title}</span>
                <span className="ck">{p.state === "done" ? "✓" : ""}</span>
              </li>
            ))}
          </ul>
          <p className="dash-saved">
            <span>✓</span> Progress saved to your account
          </p>
        </div>
      </div>
      <figcaption>What your account keeps for each guide, on every device.</figcaption>
    </figure>
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
              Unlecture takes you through a course step by step before the exam: short videos that play on the page,
              the key points, exam-style quizzes and paper exercises.
            </p>
            <div className="act">
              <Link href="/signup" className="cta">
                Sign up free to track your progress
                <span aria-hidden="true" className="arr">
                  →
                </span>
              </Link>
              <p className="note">Just an email and a password.</p>
            </div>
            <p className="why">
              <b>Why an account?</b> It saves your quiz answers, the parts you mark done and your score, so you can pick
              up where you left off on any device. The guides open as soon as you sign up.
            </p>
            <p className="login">
              Already have an account? <Link href="/login">Log in</Link> to see your saved progress.
            </p>
            <p className="login">
              Not ready to sign up? <Link href="/guides/dae-midterm">Try Part 0 without an account</Link>. Nothing is
              saved there.
            </p>
          </div>
          <ProgressPreview />
        </div>
      </section>

      <section className="band alt" aria-labelledby="saves-title">
        <div className="wrap">
          <p className="eyebrow">Why sign up</p>
          <h2 id="saves-title">Your account keeps track of your progress</h2>
          <p className="sub">
            The guides are free. Your account is where your progress lives, so nothing is lost between study sessions.
          </p>
          <ul className="saves">
            {saves.map((s) => (
              <li key={s.title} className="save">
                <span aria-hidden="true" className={`ico ${s.tone}`}>
                  {s.icon}
                </span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ul>
          <p className="private">
            <b>Private to you.</b> Other students cannot see your progress, and you can reset a guide at any time.
          </p>
        </div>
      </section>

      <section className="band" aria-labelledby="how-title">
        <div className="wrap">
          <p className="eyebrow">Available now</p>
          <h2 id="how-title">How a guide works</h2>
          <p className="sub">
            Each guide splits a course into short parts, and each part has up to four steps. The first guide is ready.
          </p>
          <article className="guide" aria-labelledby="guide-title">
            <div className="g-top">
              <span className="g-brand">DAE Midterm · Study guide</span>
              <span className="g-lock">
                <LockIcon />
                Free with an account
              </span>
            </div>
            <div className="g-body">
              <h3 id="guide-title">Data Analysis for Economics: the midterm, step by step</h3>
              <p>Units I and II in 15 parts, from data and samples to multiple regression, ending with a full mock exam.</p>
              <p>100+ exam-style questions and 50+ paper exercises in one place. Work from top to bottom.</p>
              <ol className="steps" tabIndex={0} aria-label="How a guide works">
                {steps.map((s, i) => (
                  <li key={s.name} className="step">
                    <b>
                      <span aria-hidden="true">{i + 1} · </span>
                      {s.name}
                    </b>
                    {s.text}
                  </li>
                ))}
              </ol>
              <ul className="facts" aria-label="About the exam">
                <li className="chip hot">
                  Exam <time dateTime="2026-10-16T14:30:00+02:00">Fri 16 Oct · 14:30</time>
                </li>
                {examFacts.map((f) => (
                  <li key={f} className="chip">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <p className="g-gate">
              <LockIcon />
              <span>
                <b>Opens after you sign up or log in.</b> Your account keeps every quiz answer, every part you mark done
                and your score. Part 0 is open as a <Link href="/guides/dae-midterm">free preview</Link> without an
                account, but nothing is saved there.
              </span>
            </p>
          </article>
          <p className="later">New guides show up in your account as they are published.</p>
        </div>
      </section>
    </main>
  );
}
