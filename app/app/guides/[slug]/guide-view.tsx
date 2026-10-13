"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LETTERS, questionKeys, type GuideContent, type GuidePart, type GuideQuestion } from "@/lib/guides";
import { saveGuideProgress, type GuideProgress } from "../actions";

type Update = (fn: (p: GuideProgress) => GuideProgress) => void;

const EMPTY: GuideProgress = { done: {}, quiz: {} };
// The videos are YouTube embeds (unlisted) that play inside the page.
// Nothing is loaded from YouTube until the student presses play.
const YT_ORIGIN = "https://www.youtube-nocookie.com";

const mmss = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// Text for places that cannot hold HTML (the jump menu).
const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function Html({ html, className, block = false }: { html: string; className?: string; block?: boolean }) {
  const Tag = block ? "div" : "span";
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Minute clock for the countdown; null on the server so the first render matches.
const subscribeMinute = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

function Countdown({ exam }: { exam: string }) {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, noMinute);
  if (minute === null) return <div className="cd" />;
  const ms = Date.parse(exam) - minute * 60_000;
  if (ms <= 0) return <div className="cd">Exam day: good luck!</div>;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return (
    <div className="cd">
      Exam in {d} d {h} h
    </div>
  );
}

export function GuideView({
  guideId,
  title,
  summary,
  content,
  initialProgress,
}: {
  guideId: string;
  title: string;
  summary: string;
  content: GuideContent;
  initialProgress: GuideProgress | null;
}) {
  const [progress, setProgress] = useState<GuideProgress>(() => initialProgress ?? EMPTY);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const latest = useRef(progress);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  // Saves run one after another and always send the newest state, so an old save can never win.
  const save = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const { error } = await saveGuideProgress(guideId, latest.current).catch(() => ({ error: "offline" }));
      if (!timer.current) setSaveState(error ? "error" : "saved");
    });
  }, [guideId]);

  const update = useCallback<Update>(
    (fn) => {
      const next = fn(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      setProgress(next);
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        save();
      }, 800);
    },
    [save],
  );

  // Leaving the tab: save right away instead of waiting for the timer.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden" || !timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      save();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  // Highlight the part that holds the middle of the screen.
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("section[data-part]");
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setCurrent((hit.target as HTMLElement).id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [content.parts]);

  const stats = useMemo(() => {
    let total = 0;
    let answered = 0;
    let marks = 0;
    for (const p of content.parts) {
      for (const { q, key } of questionKeys(p)) {
        total++;
        const picks = progress.quiz[key];
        if (picks) {
          answered++;
          marks += picks.filter((x) => q.correct.includes(x)).length;
        }
      }
    }
    const done = content.parts.filter((p) => progress.done[p.n]).length;
    const exercises = content.parts.reduce((a, p) => a + p.works.length, 0);
    return { total, answered, marks, done, exercises };
  }, [content.parts, progress]);

  const units = useMemo(() => {
    const out: { unit: string; parts: GuidePart[] }[] = [];
    for (const p of content.parts) {
      if (out.at(-1)?.unit !== p.unit) out.push({ unit: p.unit, parts: [] });
      out.at(-1)!.parts.push(p);
    }
    return out;
  }, [content.parts]);

  const pct = content.parts.length ? (100 * stats.done) / content.parts.length : 0;
  const saveText = { idle: "", saving: "Saving…", saved: "Progress saved", error: "Not saved. Check your connection." }[saveState];
  const brand = plain(content.brand) || plain(title).split(":")[0];

  const resetAll = () => {
    if (window.confirm("Reset all quiz answers and done marks in this guide?")) update(() => EMPTY);
  };

  return (
    <div className="dg">
      <header className="top">
        <Link href="/app" className="back" aria-label="All guides">
          ← Guides
        </Link>
        <div className="brand">{brand}</div>
        {content.exam && <Countdown exam={content.exam} />}
        <div
          className="bar"
          role="progressbar"
          aria-label="Parts marked done"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="stat">
          {stats.done}/{content.parts.length} parts · {stats.answered}/{stats.total} questions · {stats.marks}/
          {stats.answered * 2} marks
        </div>
        <label htmlFor="jump" className="sr-only">
          Jump to part
        </label>
        <select
          id="jump"
          value={current ?? ""}
          onChange={(e) => {
            if (e.target.value) document.getElementById(e.target.value)?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <option value="">Jump to part…</option>
          {units.map((u) => (
            <optgroup key={u.unit} label={u.unit}>
              {u.parts.map((p) => (
                <option key={p.n} value={`part-${p.n}`}>
                  {progress.done[p.n] ? "✓ " : ""}Part {p.n} · {plain(p.title)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className={`save${saveState === "error" ? " err" : ""}`} aria-live="polite">
          {saveText}
        </div>
      </header>

      <div className="wrap">
        <nav className="side" aria-label="Parts of this guide">
          {units.map((u) => (
            <div key={u.unit}>
              <div className="nh">{u.unit}</div>
              {u.parts.map((p) => {
                const id = `part-${p.n}`;
                return (
                  <a
                    key={p.n}
                    href={`#${id}`}
                    aria-current={current === id ? "location" : undefined}
                    className={`${current === id ? "cur" : ""} ${progress.done[p.n] ? "done" : ""}`}
                  >
                    <span className="n">{p.n}</span>
                    <Html html={p.title} />
                    <span className="ck" aria-label={progress.done[p.n] ? "done" : undefined}>
                      ✓
                    </span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="content">
          <div className="hero">
            <h1>{title}</h1>
            {summary && <p>{summary}</p>}
            <p>
              {content.parts.length} videos, {stats.total} exam-style questions and {stats.exercises} paper exercises in
              one place. Work from top to bottom. Your progress is saved to your account.
            </p>
            <ol className="steps">
              <li className="step">
                <b>1 · Watch</b>Pause at every stop sign and solve on paper.
              </li>
              <li className="step">
                <b>2 · Remember</b>Read the key points under the video.
              </li>
              <li className="step">
                <b>3 · Quiz</b>Pick TWO of six, then check. Explanations for every option.
              </li>
              <li className="step">
                <b>4 · Paper</b>Solve the exercises by hand, then open the answer.
              </li>
            </ol>
            {content.facts.length > 0 && (
              <ul className="facts" aria-label="Exam facts">
                {content.facts.map((f, i) => (
                  <li key={f}>
                    <Html html={f} className={`chip${i === 0 ? " hot" : ""}`} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {units.map((u) => (
            <div key={u.unit}>
              <h2 className="unit">{u.unit}</h2>
              {u.parts.map((p) => (
                <PartSection key={p.n} part={p} progress={progress} update={update} />
              ))}
            </div>
          ))}

          {content.notOnSheet.length > 0 && (
            <section className="final" aria-labelledby="not-on-sheet">
              <h2 id="not-on-sheet">Not on the formula sheet: learn it</h2>
              <ol>
                {content.notOnSheet.map((x) => (
                  <li key={x}>
                    <Html html={x} />
                  </li>
                ))}
              </ol>
            </section>
          )}

          {content.examDay.length > 0 && (
            <section className="checklist" aria-labelledby="exam-day">
              <h2 id="exam-day">Exam day</h2>
              <ul>
                {content.examDay.map((x) => (
                  <li key={x}>
                    <Html html={x} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="foot">
            {content.credit ? <Html html={content.credit} /> : <span />}
            <button type="button" className="iconbtn" onClick={resetAll}>
              Reset my progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartSection({ part, progress, update }: { part: GuidePart; progress: GuideProgress; update: Update }) {
  const id = `part-${part.n}`;
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [chapter, setChapter] = useState(-1);
  const done = !!progress.done[part.n];

  const setDone = useCallback(
    (value: boolean) =>
      update((p) => {
        if (!!p.done[part.n] === value) return p;
        const next = { ...p.done };
        if (value) next[part.n] = true;
        else delete next[part.n];
        return { ...p, done: next };
      }),
    [update, part.n],
  );

  const send = (func: string, args: unknown[] = []) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);

  const seek = (t: number) => {
    if (!part.yt) return;
    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!src) {
      const origin = encodeURIComponent(window.location.origin);
      setSrc(
        `${YT_ORIGIN}/embed/${part.yt}?enablejsapi=1&rel=0&playsinline=1&autoplay=1&start=${Math.floor(t)}&origin=${origin}`,
      );
      return;
    }
    send("seekTo", [t, true]);
    send("playVideo");
  };

  // Follow the player: highlight the current chapter, and mark the part done when the video ends.
  useEffect(() => {
    if (!src) return;
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== YT_ORIGIN || ev.source !== frame.current?.contentWindow) return;
      let data: unknown;
      try {
        data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      } catch {
        return;
      }
      const info = (data as { info?: { currentTime?: unknown; playerState?: unknown } } | null)?.info;
      if (!info || typeof info !== "object") return;
      if (typeof info.currentTime === "number") {
        const now = info.currentTime;
        let idx = -1;
        part.chapters.forEach(([start], i) => {
          if (start <= now + 0.3) idx = i;
        });
        setChapter(idx);
      }
      if (info.playerState === 0) setDone(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [src, part.chapters, setDone]);

  const qs = questionKeys(part).map(({ q, key }, i) => {
    const mock = /^(Q\d+)\.\s*/.exec(q.stem);
    const nDrills = part.drills.length;
    const label =
      i < nDrills ? (mock ? `Mock exam · ${mock[1]}` : `From the video · ${i + 1}`) : `New question · ${i - nDrills + 1}`;
    return { q, key, label };
  });

  return (
    <section id={id} data-part={part.n} className="part" aria-labelledby={`${id}-title`}>
      <div className="ph">
        <span className="pn">Part {part.n}</span>
        <h3 id={`${id}-title`}>
          <Html html={part.title} />
        </h3>
        <span className="dur">{part.dur}</span>
        <label className="done-toggle">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> Done
        </label>
      </div>

      <div ref={box} className="vid">
        {src ? (
          <iframe
            ref={frame}
            src={src}
            title={`Part ${part.n} video`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() =>
              frame.current?.contentWindow?.postMessage(
                JSON.stringify({ event: "listening", id: part.slug, channel: "widget" }),
                YT_ORIGIN,
              )
            }
          />
        ) : part.yt ? (
          <button type="button" className="play" onClick={() => seek(0)}>
            <span>
              <span className="circle" aria-hidden="true">
                ▶
              </span>
              <span className="t1">
                Play Part {part.n} · {part.dur}
              </span>
              <span className="t2">Plays here on the page</span>
            </span>
          </button>
        ) : (
          <div className="soon">Video coming soon</div>
        )}
      </div>

      {part.chapters.length > 0 && (
        <div className="chaps" aria-label="Chapters">
          {part.chapters.map(([t, name], i) => (
            <button
              key={`${t}-${i}`}
              type="button"
              disabled={!part.yt}
              onClick={() => seek(t)}
              aria-current={chapter === i ? "true" : undefined}
              className={chapter === i ? "cur" : undefined}
            >
              <span className="ts">{mmss(t)}</span>
              <Html html={name} />
            </button>
          ))}
        </div>
      )}

      {part.recaps.length > 0 && (
        <>
          <h4 className="sub">Remember this</h4>
          <div className="remember">
            {part.recaps.map((r) => (
              <Html key={r} html={r} block className="rp" />
            ))}
          </div>
        </>
      )}

      {qs.length > 0 && (
        <>
          <h4 className="sub">
            Quiz <span className="cnt">· {qs.length} questions · pick TWO</span>
          </h4>
          {qs.map(({ q, key, label }) => (
            <Quiz
              key={key}
              q={q}
              label={label}
              picks={progress.quiz[key] ?? null}
              onCheck={(picks) => update((p) => ({ ...p, quiz: { ...p.quiz, [key]: picks } }))}
              onReset={() =>
                update((p) => {
                  const quiz = { ...p.quiz };
                  delete quiz[key];
                  return { ...p, quiz };
                })
              }
              onWatch={q.at !== null && part.yt ? () => seek(q.at as number) : null}
            />
          ))}
        </>
      )}

      {part.works.length > 0 && (
        <>
          <h4 className="sub">
            On paper <span className="cnt">· {part.works.length} exercises</span>
          </h4>
          {part.works.map((w, i) => (
            <div key={i} className="ex">
              <span className="tag">
                Exercise {i + 1}
                {w.tag && (
                  <>
                    {" · "}
                    <Html html={w.tag} />
                  </>
                )}
              </span>
              <Html html={w.q} block className="qt" />
              <details>
                <summary />
                <Html html={w.a} block className="ans" />
              </details>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function Quiz({
  q,
  label,
  picks,
  onCheck,
  onReset,
  onWatch,
}: {
  q: GuideQuestion;
  label: string;
  picks: string[] | null;
  onCheck: (picks: string[]) => void;
  onReset: () => void;
  onWatch: (() => void) | null;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const checked = picks !== null;
  const shown = checked ? picks : sel;
  const right = checked ? picks.filter((x) => q.correct.includes(x)).length : 0;

  const toggle = (letter: string) => {
    if (checked) return;
    setSel((s) => (s.includes(letter) ? s.filter((x) => x !== letter) : s.length < 2 ? [...s, letter] : s));
  };

  return (
    <div className={`q${checked ? " checked" : ""}`}>
      <div className="qh">
        <span className={`src ${q.src}`}>{q.src === "video" ? "Video drill" : "New"}</span>
        {label}
      </div>
      {q.ctx && <Html html={q.ctx} block className="ctx" />}
      <Html html={q.stem.replace(/^Q\d+\.\s*/, "")} block className="stem" />
      <div className="opts">
        {q.opts.map((o, i) => {
          const letter = LETTERS[i];
          const picked = shown.includes(letter);
          const ok = q.correct.includes(letter);
          const cls = ["opt", picked && "sel", checked && ok && "right", checked && picked && !ok && "wrongpick", checked && ok && !picked && "missed"]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={letter}
              type="button"
              aria-pressed={picked}
              aria-disabled={checked}
              onClick={() => toggle(letter)}
              className={cls}
            >
              <span className="l">{letter}</span>
              <span>
                <Html html={o} />
                {checked && q.notes[i] && <Html html={q.notes[i]} className="nt" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="qa">
        {checked ? (
          <button type="button" className="btn ghost" onClick={onReset}>
            Try again
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={sel.length !== 2}
            onClick={() => {
              onCheck([...sel].sort());
              setSel([]);
            }}
          >
            Check
          </button>
        )}
        <span role="status" className={`score s${right}`}>
          {checked && (right === 2 ? "2 / 2 correct" : `${right} / 2 · correct: ${q.correct.join(" and ")}`)}
        </span>
        {onWatch && (
          <button type="button" className="watch" onClick={onWatch}>
            ▶ Explained at {mmss(q.at ?? 0)} in the video
          </button>
        )}
      </div>
      {checked && q.expl && <Html html={q.expl} block className="expl" />}
    </div>
  );
}
