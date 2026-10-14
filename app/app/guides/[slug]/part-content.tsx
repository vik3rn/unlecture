"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogoMark } from "@/app/components/logo";
import { LETTERS, mmss, plain, questionKeys, type GuidePart, type GuideQuestion } from "@/lib/guides";
import { useGuide } from "./progress";
import { Html } from "./ui";

// The videos play inside the page: from the private R2 bucket (short-lived link from /api/video) or, as a fallback,
// as a YouTube embed. Nothing is loaded from YouTube until the student presses play.
const YT_ORIGIN = "https://www.youtube-nocookie.com";

export function PartContent({ part }: { part: GuidePart }) {
  const { slug, progress, update } = useGuide();
  const frame = useRef<HTMLIFrameElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null); // YouTube embed
  const [videoSrc, setVideoSrc] = useState<string | null>(null); // short-lived R2 link
  const [fileFailed, setFileFailed] = useState(false);
  const pendingSeek = useRef<number | null>(null);
  const retried = useRef(false);
  const [chapter, setChapter] = useState(-1);
  const useFile = !!part.file && !fileFailed;
  const hasVideo = useFile || !!part.yt;

  const setDone = useCallback(
    () =>
      update((p) => (p.done[part.n] ? p : { ...p, done: { ...p.done, [part.n]: true } })),
    [update, part.n],
  );

  const followChapter = useCallback(
    (now: number) => {
      let idx = -1;
      part.chapters.forEach(([start], i) => {
        if (start <= now + 0.3) idx = i;
      });
      setChapter(idx);
    },
    [part.chapters],
  );

  const send = (func: string, args: unknown[] = []) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);

  const startYouTube = (t: number) => {
    if (!part.yt) return;
    const origin = encodeURIComponent(window.location.origin);
    setSrc(`${YT_ORIGIN}/embed/${part.yt}?enablejsapi=1&rel=0&playsinline=1&autoplay=1&start=${Math.floor(t)}&origin=${origin}`);
  };

  // Asks the server for a fresh link to this part's video (checks login / free preview).
  const getLink = async () => {
    try {
      const r = await fetch(`/api/video?guide=${encodeURIComponent(slug)}&part=${part.n}`, { cache: "no-store" });
      if (!r.ok) return null;
      const { url } = (await r.json()) as { url?: unknown };
      return typeof url === "string" && url.startsWith("https://") ? url : null;
    } catch {
      return null;
    }
  };

  const seek = async (t: number) => {
    if (!hasVideo) return;
    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (useFile) {
      const v = video.current;
      if (videoSrc && v) {
        v.currentTime = t;
        void v.play().catch(() => {});
        return;
      }
      pendingSeek.current = t;
      const url = await getLink();
      if (url) return setVideoSrc(url);
      setFileFailed(true); // no link: use YouTube instead if this part has it
      return startYouTube(t);
    }
    if (!src) return startYouTube(t);
    send("seekTo", [t, true]);
    send("playVideo");
  };

  // The link expired or the file failed: get a new link once and carry on from the same spot.
  const onVideoError = async () => {
    const at = video.current?.currentTime ?? 0;
    if (!retried.current) {
      retried.current = true;
      const url = await getLink();
      if (url) {
        pendingSeek.current = at;
        return setVideoSrc(url);
      }
    }
    setVideoSrc(null);
    setFileFailed(true);
  };

  // Next 16 (cacheComponents) keeps recently visited pages in React <Activity> (display: none) instead of
  // unmounting them, and hidden media keeps playing. Pause on hide; the position is kept because the DOM node stays.
  useLayoutEffect(() => {
    const v = video.current;
    const f = frame.current;
    return () => {
      v?.pause();
      f?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), YT_ORIGIN);
    };
  }, [videoSrc, src]);

  // YouTube player: highlight the current chapter, and mark the part done when the video ends.
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
      if (typeof info.currentTime === "number") followChapter(info.currentTime);
      if (info.playerState === 0) setDone();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [src, followChapter, setDone]);

  const qs = questionKeys(part).map(({ q, key }, i) => {
    const mock = /^(Q\d+)\.\s*/.exec(q.stem);
    const nDrills = part.drills.length;
    const label =
      i < nDrills ? (mock ? `Mock exam · ${mock[1]}` : `From the video · ${i + 1}`) : `New question · ${i - nDrills + 1}`;
    return { q, key, label };
  });

  return (
    <>
      <div ref={box} className="vid">
        {videoSrc ? (
          <video
            ref={video}
            src={videoSrc}
            controls
            autoPlay
            playsInline
            preload="metadata"
            aria-label={`Part ${part.n} video`}
            onLoadedMetadata={(e) => {
              retried.current = false;
              if (pendingSeek.current) e.currentTarget.currentTime = pendingSeek.current;
              pendingSeek.current = null;
            }}
            onTimeUpdate={(e) => followChapter(e.currentTarget.currentTime)}
            onEnded={setDone}
            onError={onVideoError}
          />
        ) : src ? (
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
        ) : hasVideo ? (
          <button
            type="button"
            className="play"
            onClick={() => seek(0)}
            aria-label={`Play Part ${part.n}: ${plain(part.title)} (${part.dur})`}
          >
            <span className="th-pill">
              Part {part.n} · <Html html={part.unit} />
            </span>
            <span className="th-title">
              <Html html={part.title} />
            </span>
            <span className="th-meta">
              {part.dur}
              {part.chapters.length > 1 && ` · ${part.chapters.length - 1} chapters`}
            </span>
            <span className="circle" aria-hidden="true">
              ▶
            </span>
            <span className="th-brand" aria-hidden="true">
              <LogoMark size={22} /> Unlecture
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
              disabled={!hasVideo}
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
        <section className="sec" aria-labelledby={`rem-${part.n}`}>
          <h2 id={`rem-${part.n}`}>Remember this</h2>
          <div className="remember">
            {part.recaps.map((r) => (
              <Html key={r} html={r} block className="rp" />
            ))}
          </div>
        </section>
      )}

      {qs.length > 0 && (
        <section className="sec" aria-labelledby={`quiz-${part.n}`}>
          <h2 id={`quiz-${part.n}`}>
            Quiz <span className="cnt">{qs.length} questions · pick two</span>
          </h2>
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
              onWatch={q.at !== null && hasVideo ? () => seek(q.at as number) : null}
            />
          ))}
        </section>
      )}

      {part.works.length > 0 && (
        <section className="sec" aria-labelledby={`paper-${part.n}`}>
          <h2 id={`paper-${part.n}`}>
            On paper <span className="cnt">{part.works.length} exercises</span>
          </h2>
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
        </section>
      )}
    </>
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
            <button key={letter} type="button" aria-pressed={picked} aria-disabled={checked} onClick={() => toggle(letter)} className={cls}>
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
