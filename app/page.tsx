import Link from "next/link";

const steps = [
  {
    title: "Watch one short part at a time",
    body: "Each guide splits a course into short videos that play right on the page, with chapters you can jump between.",
  },
  {
    title: "Check yourself with exam-style quizzes",
    body: "Questions built like the real exam. Every option comes with an explanation and a link to the moment in the video.",
  },
  {
    title: "Practise on paper, then see the answer",
    body: "Worked exercises to solve by hand. Your answers and progress are saved to your account, on any device.",
  },
];

function GuidePreview() {
  return (
    <div
      className="card relative overflow-hidden p-5 shadow-[0_20px_60px_-30px_rgba(67,56,202,0.45)] sm:p-6"
      role="img"
      aria-label="Example: one part of an exam guide, with a video, a progress bar and a quiz question where two of six answers are correct."
    >
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>Part 7 · OLS regression</span>
        <span>6 of 15 parts done</span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-line">
        <div className="h-full w-2/5 rounded-full bg-ok" />
      </div>
      <div className="mt-4 grid aspect-video place-items-center rounded-xl bg-gradient-to-br from-[#1b1d33] to-[#0b0c16] text-white">
        <span className="grid size-14 place-items-center rounded-full bg-white/15 text-xl">▶</span>
      </div>
      <p className="mt-4 text-sm font-semibold">Which TWO statements about OLS are correct?</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <span className="rounded-lg border-2 border-ok bg-ok-soft px-2.5 py-2">The residuals sum to zero</span>
        <span className="rounded-lg border-2 border-line bg-surface px-2.5 py-2 text-muted">R² can be negative</span>
        <span className="rounded-lg border-2 border-line bg-surface px-2.5 py-2 text-muted">It maximises SSR</span>
        <span className="rounded-lg border-2 border-ok bg-ok-soft px-2.5 py-2">The line passes through (x̄, ȳ)</span>
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
            Exam coming up? Get through the course step by step.
          </h1>
          <p className="mt-5 text-lg text-muted">
            Unlecture exam guides take you through a whole course in one place: short videos, the key points,
            exam-style quizzes and paper exercises, so you know what to expect on exam day.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="btn-primary px-7 text-lg">
              Sign up free
            </Link>
            <p className="text-sm text-muted">No credit card. Your progress stays private.</p>
          </div>
        </div>
        <GuidePreview />
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
