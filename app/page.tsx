import Link from "next/link";

const steps = [
  {
    title: "Tell it what's confusing",
    body: "Type the topic, paste your notes, or upload the lecture slides you don't get.",
  },
  {
    title: "Watch a clear explainer",
    body: "A narrated video builds the idea step by step with diagrams, charts and formulas, in your language.",
  },
  {
    title: "Check that it clicked",
    body: "The video pauses for quick quiz questions, then gives you flashcards to review before the exam.",
  },
];

function ScenePreview() {
  return (
    <div
      className="card relative overflow-hidden p-5 shadow-[0_20px_60px_-30px_rgba(67,56,202,0.45)] sm:p-6"
      role="img"
      aria-label="Example: an explainer video scene about OLS regression with a fitted line through data points and narration subtitles."
    >
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>Scene 3 of 9 · OLS regression</span>
        <span>2:14 / 4:30</span>
      </div>
      <svg viewBox="0 0 320 170" className="mt-4 w-full" aria-hidden="true">
        <line x1="20" y1="150" x2="310" y2="150" stroke="var(--line)" strokeWidth="2" />
        <line x1="20" y1="150" x2="20" y2="10" stroke="var(--line)" strokeWidth="2" />
        {[
          [45, 128], [70, 120], [92, 104], [118, 110], [140, 88], [165, 92],
          [188, 70], [210, 74], [236, 52], [260, 58], [284, 36],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="var(--muted)" opacity="0.55" />
        ))}
        <line x1="30" y1="138" x2="300" y2="30" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        <line x1="140" y1="88" x2="140" y2="94" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
      <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-sm">
        &ldquo;OLS picks the line that makes the squared distances to every point as small as
        possible.&rdquo;
      </p>
      <div className="mt-4 h-1.5 rounded-full bg-line">
        <div className="h-full w-1/2 rounded-full bg-accent" />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main id="main" className="flex-1">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-12 sm:py-20 md:grid-cols-2">
        <div>
          <p className="inline-block rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-ink">
            For IE University students with an exam coming up
          </p>
          <h1 className="mt-5 text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
            Lecture slides didn&rsquo;t click? Watch them explained.
          </h1>
          <p className="mt-5 text-lg text-muted">
            Unlecture turns confusing lecture slides into clear, narrated explainer videos, so
            you finally get it before the exam.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="btn-primary px-7 text-lg">
              Sign up free
            </Link>
            <p className="text-sm text-muted">No credit card. Your study packs stay private.</p>
          </div>
        </div>
        <ScenePreview />
      </section>

      <section className="border-t border-line bg-surface" aria-labelledby="how-heading">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
          <h2 id="how-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="card bg-bg p-5">
                <span
                  aria-hidden="true"
                  className="grid size-9 place-items-center rounded-full bg-accent font-semibold text-accent-ink"
                >
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
