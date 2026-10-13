"use client";

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

function Html({ html, className = "", block = false }: { html: string; className?: string; block?: boolean }) {
  const Tag = block ? "div" : "span";
  return <Tag className={`guide-html ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
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
  if (minute === null) return null;
  const ms = Date.parse(exam) - minute * 60_000;
  if (ms <= 0) return <p className="text-sm font-semibold text-warn">Exam day: good luck!</p>;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return (
    <p className="text-sm font-semibold text-warn">
      Exam in {d} d {h} h
    </p>
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

  // Highlight the part in the middle of the screen.
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

  const pct = content.parts.length ? Math.round((100 * stats.done) / content.parts.length) : 0;
  const statLine = `${stats.done}/${content.parts.length} parts · ${stats.answered}/${stats.total} questions · ${stats.marks}/${stats.answered * 2} marks`;
  const saveText = { idle: "", saving: "Saving…", saved: "Progress saved", error: "Could not save. Check your connection." }[saveState];

  const resetAll = () => {
    if (window.confirm("Reset all quiz answers and done marks in this guide?")) update(() => EMPTY);
  };

  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Sidebar (large screens) */}
      <aside className="hidden lg:block">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] space-y-4 overflow-auto pr-1">
          <div className="card space-y-2 p-4">
            {content.exam && <Countdown exam={content.exam} />}
            <div
              className="h-2 overflow-hidden rounded-full bg-accent-soft"
              role="progressbar"
              aria-label="Parts marked done"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-sm text-muted">{statLine}</p>
            <p className="min-h-5 text-xs text-muted" aria-live="polite">
              {saveText}
            </p>
          </div>
          <nav aria-label="Parts of this guide">
            {units.map((u) => (
              <div key={u.unit}>
                <p className="mt-4 mb-1 px-2 text-xs font-semibold tracking-wider text-muted uppercase">{u.unit}</p>
                <ul>
                  {u.parts.map((p) => {
                    const id = `part-${p.n}`;
                    return (
                      <li key={p.n}>
                        <a
                          href={`#${id}`}
                          aria-current={current === id ? "location" : undefined}
                          className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm ${
                            current === id ? "bg-accent-soft font-semibold text-ink" : "text-muted hover:bg-accent-soft/60"
                          }`}
                        >
                          <span className="w-5 shrink-0 text-right tabular-nums">{p.n}</span>
                          <Html html={p.title} />
                          {progress.done[p.n] && (
                            <span className="ml-auto font-bold text-ok" aria-label="done">
                              ✓
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Compact bar (small screens) */}
        <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur lg:hidden">
          <label htmlFor="jump" className="sr-only">
            Jump to part
          </label>
          <select
            id="jump"
            className="field min-h-10 flex-1 py-1.5 text-sm"
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
                    {progress.done[p.n] ? "✓ " : ""}Part {p.n}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="shrink-0 text-sm text-muted">
            {stats.done}/{content.parts.length} done
          </span>
        </div>

        <header className="card p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {summary && <p className="mt-2 text-muted">{summary}</p>}
          <p className="mt-2 text-muted">
            {content.parts.length} videos, {stats.total} exam-style questions and {stats.exercises} paper exercises.
            Work from top to bottom. Your progress is saved to your account.
          </p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Watch", "Pause at every stop sign and solve on paper."],
              ["Remember", "Read the key points under the video."],
              ["Quiz", "Pick TWO of six, then check. Every option is explained."],
              ["Paper", "Solve the exercises by hand, then open the answer."],
            ].map(([h, t], i) => (
              <li key={h} className="rounded-xl bg-bg p-3 text-sm text-muted">
                <span className="block font-semibold text-ink">
                  {i + 1} · {h}
                </span>
                {t}
              </li>
            ))}
          </ol>
          {content.facts.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Exam facts">
              {content.facts.map((f, i) => (
                <li
                  key={f}
                  className={`rounded-full px-3 py-1 text-sm ${i === 0 ? "bg-warn-soft font-semibold text-warn" : "bg-accent-soft text-muted"}`}
                >
                  <Html html={f} />
                </li>
              ))}
            </ul>
          )}
        </header>

        {units.map((u) => (
          <div key={u.unit}>
            <h2 className="mt-10 mb-3 flex items-center gap-3 text-xs font-bold tracking-[.12em] text-muted uppercase after:h-px after:flex-1 after:bg-line">
              {u.unit}
            </h2>
            {u.parts.map((p) => (
              <PartSection key={p.n} part={p} progress={progress} update={update} />
            ))}
          </div>
        ))}

        {content.notOnSheet.length > 0 && (
          <section className="card mt-8 border-2 border-danger p-6" aria-labelledby="not-on-sheet">
            <h2 id="not-on-sheet" className="text-xl font-semibold text-danger">
              Not on the formula sheet: learn it
            </h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-6 sm:columns-2 sm:gap-8">
              {content.notOnSheet.map((x) => (
                <li key={x} className="break-inside-avoid">
                  <Html html={x} className="font-serif" />
                </li>
              ))}
            </ol>
          </section>
        )}

        {content.examDay.length > 0 && (
          <section className="card mt-6 p-6" aria-labelledby="exam-day">
            <h2 id="exam-day" className="text-xl font-semibold">
              Exam day
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-6">
              {content.examDay.map((x) => (
                <li key={x}>
                  <Html html={x} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          {content.credit ? <Html html={content.credit} /> : <span />}
          <button type="button" className="btn-secondary text-sm" onClick={resetAll}>
            Reset my progress
          </button>
        </div>
        <p className="mt-2 text-sm text-muted lg:hidden" aria-live="polite">
          {saveText}
        </p>
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
    <section id={id} data-part={part.n} className="card mb-6 scroll-mt-16 p-5 sm:p-7" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold tracking-wider text-ink uppercase">
          Part {part.n}
        </span>
        <h3 id={`${id}-title`} className="min-w-60 flex-1 text-xl font-semibold sm:text-2xl">
          <Html html={part.title} />
        </h3>
        <span className="text-sm text-muted tabular-nums">{part.dur}</span>
        <label className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="size-5 accent-[var(--ok)]"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
          />
          Done
        </label>
      </div>

      <div ref={box} className="mt-4 aspect-video overflow-hidden rounded-xl bg-black">
        {src ? (
          <iframe
            ref={frame}
            src={src}
            title={`Part ${part.n} video`}
            className="size-full border-0"
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
          <button
            type="button"
            onClick={() => seek(0)}
            className="group grid size-full cursor-pointer place-items-center bg-gradient-to-br from-[#1b1d33] to-[#0b0c16] text-center text-white"
          >
            <span>
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-white/15 text-2xl transition-colors group-hover:bg-white/25 sm:size-20">
                ▶
              </span>
              <span className="mt-3 block font-semibold">
                Play Part {part.n} · {part.dur}
              </span>
              <span className="mt-1 block text-sm text-white/70">Plays here on the page</span>
            </span>
          </button>
        ) : (
          <div className="grid size-full place-items-center p-6 text-center text-white/80">Video coming soon</div>
        )}
      </div>

      {part.chapters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Chapters">
          {part.chapters.map(([t, name], i) => (
            <button
              key={`${t}-${i}`}
              type="button"
              disabled={!part.yt}
              onClick={() => seek(t)}
              aria-current={chapter === i ? "true" : undefined}
              className={`min-h-9 rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-default disabled:opacity-60 ${
                chapter === i
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line bg-bg text-muted hover:border-accent hover:text-ink"
              }`}
            >
              <span className="mr-1.5 tabular-nums opacity-75">{mmss(t)}</span>
              <Html html={name} />
            </button>
          ))}
        </div>
      )}

      {part.recaps.length > 0 && (
        <>
          <h4 className="mt-7 mb-2 text-xs font-bold tracking-widest text-muted uppercase">Remember this</h4>
          <div className="rounded-xl bg-warn-soft px-5 py-1">
            {part.recaps.map((r) => (
              <p key={r} className="my-3 font-medium">
                <span className="font-bold text-warn" aria-hidden="true">
                  →{" "}
                </span>
                <Html html={r} />
              </p>
            ))}
          </div>
        </>
      )}

      {qs.length > 0 && (
        <>
          <h4 className="mt-7 mb-2 text-xs font-bold tracking-widest text-muted uppercase">
            Quiz <span className="font-medium tracking-normal normal-case">· {qs.length} questions · pick TWO</span>
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
          <h4 className="mt-7 mb-2 text-xs font-bold tracking-widest text-muted uppercase">
            On paper <span className="font-medium tracking-normal normal-case">· {part.works.length} exercises</span>
          </h4>
          {part.works.map((w, i) => (
            <div key={i} className="my-3 rounded-xl border border-line bg-bg p-4">
              <p className="text-xs font-bold tracking-wider text-muted uppercase">
                Exercise {i + 1}
                {w.tag && (
                  <>
                    {" · "}
                    <Html html={w.tag} />
                  </>
                )}
              </p>
              <Html html={w.q} block className="mt-1" />
              <details className="group mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-accent">
                  <span className="group-open:hidden">Show answer</span>
                  <span className="hidden group-open:inline">Hide answer</span>
                </summary>
                <Html html={w.a} block className="mt-2 rounded-lg bg-ok-soft px-4 py-3" />
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
    <div className="my-3 rounded-2xl border border-line bg-bg p-4 sm:p-5">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-muted uppercase">
        <span className={`rounded-md px-2 py-0.5 ${q.src === "video" ? "bg-accent-soft" : "bg-warn-soft text-warn"}`}>
          {q.src === "video" ? "Video drill" : "New"}
        </span>
        {label}
      </p>
      {q.ctx && (
        <Html
          html={q.ctx}
          block
          className={`guide-ctx my-2 rounded-lg border border-dashed border-line bg-surface px-3 py-2 text-sm text-muted`}
        />
      )}
      <Html html={q.stem.replace(/^Q\d+\.\s*/, "")} block className="mb-3 font-semibold" />
      <div className="grid gap-2 sm:grid-cols-2">
        {q.opts.map((o, i) => {
          const letter = LETTERS[i];
          const picked = shown.includes(letter);
          const ok = q.correct.includes(letter);
          let tone = "border-line bg-surface hover:border-accent";
          if (!checked && picked) tone = "border-accent bg-accent-soft";
          if (checked) {
            if (ok) tone = "border-ok bg-ok-soft";
            else if (picked) tone = "border-danger bg-danger-soft";
            else tone = "border-line bg-surface opacity-70";
          }
          return (
            <button
              key={letter}
              type="button"
              aria-pressed={picked}
              aria-disabled={checked}
              onClick={() => toggle(letter)}
              className={`relative flex items-start gap-3 rounded-xl border-2 p-3 text-left leading-snug ${tone} ${
                checked ? "cursor-default" : "cursor-pointer"
              }`}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-md text-sm font-bold ${
                  checked && ok
                    ? "bg-ok text-surface"
                    : checked && picked
                      ? "bg-danger text-surface"
                      : picked
                        ? "bg-accent text-accent-ink"
                        : "bg-ink text-surface"
                }`}
              >
                {letter}
              </span>
              <span>
                <Html html={o} />
                {checked && q.notes[i] && (
                  <span className={`mt-1 block text-sm font-semibold ${ok ? "text-ok" : "text-danger"}`}>
                    <Html html={q.notes[i]} />
                  </span>
                )}
              </span>
              {checked && ok && !picked && (
                <span className="absolute -top-2.5 right-3 rounded bg-ok px-1.5 py-0.5 text-[11px] font-bold text-surface uppercase">
                  missed
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {checked ? (
          <button type="button" className="btn-secondary min-h-10 text-sm" onClick={onReset}>
            Try again
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary min-h-10 text-sm"
            disabled={sel.length !== 2}
            onClick={() => {
              onCheck([...sel].sort());
              setSel([]);
            }}
          >
            Check
          </button>
        )}
        <span
          role="status"
          className={`text-sm font-semibold ${right === 2 ? "text-ok" : right === 1 ? "text-warn" : "text-danger"}`}
        >
          {checked && (right === 2 ? "2 / 2 correct" : `${right} / 2 · correct: ${q.correct.join(" and ")}`)}
        </span>
        {onWatch && (
          <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={onWatch}>
            ▶ Explained at {mmss(q.at ?? 0)} in the video
          </button>
        )}
      </div>
      {checked && q.expl && (
        <Html html={q.expl} block className="mt-3 rounded-xl border-l-4 border-ok bg-surface px-4 py-3 text-muted" />
      )}
    </div>
  );
}
