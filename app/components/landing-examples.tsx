"use client";

import { useEffect, useState } from "react";

// The example collage on the landing page: a video part, a quiz question and an exam countdown that flip to the next
// of five real examples from the guides every 5 seconds (one card after the other). The numbers are taken from the
// checked course scripts (MC Parts 0, 2, 8, 9, 12 and DAE Part 7), so every example is correct.
// It simply runs (the owner's choice: no dots, no pause button). It does not rotate with prefers-reduced-motion or in
// a background tab. The visual cards are aria-hidden; a text description of the current example is read instead.

type Opt = { t: string; ok?: boolean };
type Body =
  | { kind: "table" }
  | { kind: "alloc" }
  | { kind: "tp" }
  | { kind: "cash" }
  | { kind: "ols" };
type Example = {
  tag: string;
  cap: string;
  body: Body;
  format: string;
  chip: string;
  q: string;
  opts: Opt[];
  cols: 2 | 3;
  exam: { big: string; pct: number; note: string };
  desc: string;
};

const EXAMPLES: Example[] = [
  {
    tag: "MC · PART 9",
    cap: "Quarterly production budget",
    body: { kind: "table" },
    format: "Quiz · 4 options · 1 correct",
    chip: "+0.5",
    q: "Beginning 1,000 · sales 5,000 · target ending 2,000. Production?",
    opts: [{ t: "A · 4,000" }, { t: "B · 6,000", ok: true }, { t: "C · 7,000" }, { t: "D · None" }],
    cols: 2,
    exam: { big: "5 d 3 h", pct: 40, note: "6 of 15 parts done" },
    desc: "Management Control, Part 9: a quarterly production budget to fill in, and a quiz question: production = sales + target ending − beginning = 6,000.",
  },
  {
    tag: "MC · PART 2",
    cap: "Allocating overhead",
    body: { kind: "alloc" },
    format: "Quiz · 4 options · 1 correct",
    chip: "+0.5",
    q: "Overhead €900,000: 70 % on 30,000 machine hours. Rate per machine hour?",
    opts: [{ t: "A · €30" }, { t: "B · €21", ok: true }, { t: "C · €12" }, { t: "D · €6" }],
    cols: 2,
    exam: { big: "9 d 18 h", pct: 18, note: "3 of 17 parts done" },
    desc: "Management Control, Part 2: an overhead pool split 70/30 over machine and labor hours, and a quiz question: 630,000 ÷ 30,000 = €21 per machine hour.",
  },
  {
    tag: "MC · PART 8",
    cap: "Taxes and transfer prices",
    body: { kind: "tp" },
    format: "Quiz · 4 options · 1 correct",
    chip: "+0.5",
    q: "Seller taxed 19 %, buyer 25 %, no duty. To cut the group's tax, the transfer price should be…",
    opts: [{ t: "A · Raised", ok: true }, { t: "B · Lowered" }, { t: "C · No effect" }, { t: "D · None" }],
    cols: 2,
    exam: { big: "2 d 7 h", pct: 71, note: "12 of 17 parts done" },
    desc: "Management Control, Part 8: goods move from Czechia (tax 19 %) to China (tax 25 %); a higher transfer price moves profit to the lower-tax seller.",
  },
  {
    tag: "MC · PART 12",
    cap: "When the cash comes in",
    body: { kind: "cash" },
    format: "Quiz · 4 options · 1 correct",
    chip: "+0.5",
    q: "Sales May €50,000, June €70,000. 60 % paid in the month, 40 % the next. June receipts?",
    opts: [{ t: "A · €70,000" }, { t: "B · €58,000" }, { t: "C · €62,000", ok: true }, { t: "D · None" }],
    cols: 2,
    exam: { big: "6 d 2 h", pct: 53, note: "9 of 17 parts done" },
    desc: "Management Control, Part 12: a cash timeline, and a quiz question: June receipts = 60 % of 70,000 + 40 % of 50,000 = €62,000.",
  },
  {
    tag: "DAE · PART 7",
    cap: "OLS: finding the line",
    body: { kind: "ols" },
    format: "Quiz · 6 options · 2 correct",
    chip: "2 of 6",
    q: "x̄ = 3.0, ȳ = 4.2, slope 0.75. Which TWO are correct?",
    opts: [
      { t: "A · β̂₀ = 1.95", ok: true },
      { t: "B · β̂₀ = 4.2" },
      { t: "C · passes (3.0, 4.2)", ok: true },
      { t: "D · β̂₁ = 36/27" },
      { t: "E · ŷ(5) = 6.0" },
      { t: "F · β̂₁ = 0.25" },
    ],
    cols: 2,
    exam: { big: "12 d 4 h", pct: 13, note: "2 of 15 parts done" },
    desc: "Data Analysis for Economics, Part 7: the OLS slope 27 ÷ 36 = 0.75 and intercept 4.2 − 0.75 × 3.0 = 1.95, and a pick-two-of-six quiz.",
  },
];

const PERIOD = 5000;

function VideoBody({ body }: { body: Body }) {
  if (body.kind === "table") {
    const rows: [string, string[], boolean][] = [
      ["Sales", ["4,000", "6,000", "5,000", "3,000", "18,000"], false],
      ["+ Ending", ["1,200", "?", "?", "?", "?"], false],
      ["− Beginning", ["800", "?", "?", "?", "?"], false],
      ["Production", ["4,400", "?", "?", "?", "?"], true],
    ];
    return (
      <div className="tbl">
        <span className="h" />
        {["Q1", "Q2", "Q3", "Q4"].map((h) => (
          <span key={h} className="h r">
            {h}
          </span>
        ))}
        <span className="h r yr">Year</span>
        {rows.map(([label, cells, total]) => (
          <Row key={label} label={label} cells={cells} total={total} />
        ))}
      </div>
    );
  }
  if (body.kind === "alloc") {
    return (
      <div className="alloc">
        <div className="pool">Overhead pool · €900,000</div>
        <div className="split">
          <div className="part a" style={{ flexGrow: 70 }}>
            <b>70 % · €630,000</b>
            <span>÷ 30,000 machine hours</span>
            <em>= €21 per MH</em>
          </div>
          <div className="part b" style={{ flexGrow: 30 }}>
            <b>30 % · €270,000</b>
            <span>÷ 45,000 labor h</span>
            <em>= €6 per DLH</em>
          </div>
        </div>
      </div>
    );
  }
  if (body.kind === "tp") {
    return (
      <div className="tp">
        <div className="land seller">
          <b>Czechia</b>
          <span>plant · tax 19 %</span>
        </div>
        <div className="lane">
          <span className="goods">goods →</span>
          <span className="price">transfer price</span>
          <span className="money">← money</span>
        </div>
        <div className="land buyer">
          <b>China</b>
          <span>distributor · tax 25 %</span>
        </div>
        <p className="rule">+€1 of transfer price = €1 of profit moves to the seller</p>
      </div>
    );
  }
  if (body.kind === "cash") {
    return (
      <div className="cash">
        <div className="months">
          <div className="m">
            <b>May</b>
            <span>sales €50,000</span>
          </div>
          <div className="m">
            <b>June</b>
            <span>sales €70,000</span>
          </div>
        </div>
        <div className="flows">
          <span className="f old">40 % of May → €20,000</span>
          <span className="f new">60 % of June → €42,000</span>
          <span className="f sum">June receipts = €62,000</span>
        </div>
      </div>
    );
  }
  return (
    <div className="ols">
      <div className="given">
        <span>x̄ = 3.0</span>
        <span>ȳ = 4.2</span>
        <span>Σ(x − x̄)(y − ȳ) = 27</span>
        <span>Σ(x − x̄)² = 36</span>
      </div>
      <div className="steps-line">
        <span>
          β̂₁ = 27 ÷ 36 = <b>0.75</b>
        </span>
        <span>
          β̂₀ = 4.2 − 0.75 × 3.0 = <b>1.95</b>
        </span>
      </div>
    </div>
  );
}

function Row({ label, cells, total }: { label: string; cells: string[]; total: boolean }) {
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

export function LandingExamples() {
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setI((n) => (n + 1) % EXAMPLES.length);
    }, PERIOD);
    return () => window.clearInterval(id);
  }, [reduced]);

  const ex = EXAMPLES[i];
  return (
    <div className="collage-wrap">
      <p className="sr-only">
        Example {i + 1} of {EXAMPLES.length}: {ex.desc}
      </p>
      <div className="collage" aria-hidden="true">
        <div className="vid flip" key={`v${i}`}>
          <div className="vid-top">
            <span className="vid-tag">{ex.tag}</span>
            <span className="vid-stop">
              <span className="stop">STOP</span>Pause &amp; solve on paper
            </span>
          </div>
          <div className="vid-body">
            <div className="vid-cap">{ex.cap}</div>
            <div className="vid-stage">
              <VideoBody body={ex.body} />
            </div>
            <div className="vid-bar">
              <i style={{ ["--p" as string]: `${30 + i * 12}%` }} />
              <span>{["6:51 / 10:58", "4:12 / 10:41", "7:30 / 17:02", "5:05 / 14:24", "3:48 / 9:20"][i]}</span>
            </div>
          </div>
        </div>
        <div className="quiz flip d1" key={`q${i}`}>
          <div className="quiz-top">
            <span>{ex.format}</span>
            <span className="pts">{ex.chip}</span>
          </div>
          <p>{ex.q}</p>
          <div className={ex.cols === 3 ? "opts three" : "opts"}>
            {ex.opts.map((o) => (
              <span key={o.t} className={o.ok ? "ok" : undefined}>
                {o.t}
                {o.ok ? " ✓" : ""}
              </span>
            ))}
          </div>
        </div>
        <div className="exam flip d2" key={`e${i}`}>
          <div className="exam-cap">Your exam · example</div>
          <div className="exam-big">{ex.exam.big}</div>
          <div className="exam-bar">
            <i style={{ width: `${ex.exam.pct}%` }} />
          </div>
          <div className="exam-note">{ex.exam.note} · progress saved</div>
        </div>
      </div>
    </div>
  );
}
