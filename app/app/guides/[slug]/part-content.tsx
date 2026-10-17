"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogoMark } from "@/app/components/logo";
import { LETTERS, mmss, openKeys, plain, quizItems, type GuideFormat, type GuidePart, type GuideQuestion } from "@/lib/guides";
import { clock, NOTE_MAX } from "@/lib/notes";
import { fmtPoints, pointsWord, quizRule, round3, scoringRule, tallyPicks } from "@/lib/scoring";
import { OpenPractice, SingleQuiz } from "./answers";
import { useNotes } from "./notes-context";
import { useGuide } from "./progress";
import { Html } from "./ui";

// The videos play inside the page: from the private R2 bucket (short-lived link from /api/video) or, as a fallback,
// as a YouTube embed. Nothing is loaded from YouTube until the student presses play.
const YT_ORIGIN = "https://www.youtube-nocookie.com";

// When the direct R2 link fails or shows nothing for a few seconds (Spanish ISPs block Cloudflare addresses during
// LaLiga matches), the player switches to /api/video/stream on our own domain, which fetches the same file from R2
// on the server. Once that was needed, later parts in this visit start there straight away.
const STALL_MS = 7000;
const PROBE_MS = 2500;
let preferStream = false;
type VideoLink = { url: string; stream: string | null };

// Can the browser reach the R2 host at all? An opaque no-cors HEAD answers within a moment when it can; a blocked
// address never answers, so after PROBE_MS the answer is no.
function reachable(url: string) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), PROBE_MS);
    fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store" }).then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

// The length of a part as written in the guide ("12:34", "1:02:03" or "14 min"), for the note marks until the
// video reports its own length.
function seconds(dur: string) {
  const c = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(dur.trim());
  if (c) return c[3] ? +c[1] * 3600 + +c[2] * 60 + +c[3] : +c[1] * 60 + +c[2];
  const m = /(\d+)\s*min/i.exec(dur);
  return m ? +m[1] * 60 : null;
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function PartContent({
  part,
  format,
  startAt = null,
}: {
  part: GuidePart;
  format: GuideFormat;
  startAt?: number | null; // ?t= from a note on /app: play from there
}) {
  const { slug, progress, update, rev } = useGuide();
  const notes = useNotes();
  const { registerPlayer } = notes;
  const frame = useRef<HTMLIFrameElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null); // YouTube embed
  const [videoSrc, setVideoSrc] = useState<string | null>(null); // short-lived R2 link
  const [fileFailed, setFileFailed] = useState(false);
  const pendingSeek = useRef<number | null>(null);
  const retried = useRef(false);
  const link = useRef<VideoLink | null>(null);
  const onStream = useRef(false);
  const stall = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chapter, setChapter] = useState(-1);
  const [dur, setDur] = useState<number | null>(() => seconds(part.dur));
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const ytTime = useRef<number | null>(null);
  const ytPlaying = useRef(false);
  const noteHereRef = useRef<() => void>(() => {});
  const useFile = !!part.file && !fileFailed;
  const hasVideo = useFile || !!part.yt;
  // The part has a video file but it would not load (often a school or work network that blocks the video
  // storage) and there is no YouTube copy to fall back on.
  const failed = !!part.file && fileFailed && !part.yt;

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

  // Asks the server for a fresh link to this part's video (checks login / free preview), with the fallback link.
  const getLink = async (): Promise<VideoLink | null> => {
    try {
      const r = await fetch(`/api/video?guide=${encodeURIComponent(slug)}&part=${part.n}`, { cache: "no-store" });
      if (!r.ok) return null;
      const { url, stream } = (await r.json()) as { url?: unknown; stream?: unknown };
      if (typeof url !== "string" || !url.startsWith("https://")) return null;
      return { url, stream: typeof stream === "string" && stream.startsWith("/api/video/stream?") ? stream : null };
    } catch {
      return null;
    }
  };

  const clearStall = () => {
    if (stall.current) clearTimeout(stall.current);
    stall.current = null;
  };

  // Plays from our own domain instead of R2, from the same spot. False when there is no fallback or it is in use.
  const switchToStream = () => {
    clearStall();
    const s = link.current?.stream;
    if (!s || onStream.current) return false;
    preferStream = true;
    onStream.current = true;
    if (video.current && video.current.currentTime > 0) pendingSeek.current = video.current.currentTime;
    setVideoSrc(s);
    return true;
  };

  // Starts a link: the direct R2 file when R2 answers (still watched for a stall), otherwise the fallback.
  const play = async (l: VideoLink, at: number | null) => {
    link.current = l;
    pendingSeek.current = at;
    clearStall();
    let viaStream = preferStream && !!l.stream;
    if (!viaStream && l.stream && !(await reachable(l.url))) {
      viaStream = true;
      preferStream = true;
    }
    onStream.current = viaStream;
    setVideoSrc(viaStream ? l.stream : l.url);
    if (!viaStream && l.stream) stall.current = setTimeout(switchToStream, STALL_MS);
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
      const l = await getLink();
      if (l) return play(l, t);
      setFileFailed(true); // no link: use YouTube instead if this part has it
      return startYouTube(t);
    }
    if (!src) return startYouTube(t);
    send("seekTo", [t, true]);
    send("playVideo");
  };

  // The file failed: try our own domain first, then a new link once, from the same spot.
  const onVideoError = async () => {
    if (switchToStream()) return;
    const at = video.current?.currentTime ?? 0;
    if (!retried.current) {
      retried.current = true;
      const l = await getLink();
      if (l) return play(l, at);
    }
    clearStall();
    setVideoSrc(null);
    setFileFailed(true);
  };

  // "Try again" after a failed load: a fresh link, and the player comes back if it works.
  const retry = async () => {
    retried.current = false;
    const l = await getLink();
    if (!l) return;
    setFileFailed(false);
    play(l, null);
  };

  useEffect(() => () => clearStall(), []);

  const pausePlayer = () => {
    if (video.current) video.current.pause();
    else send("pauseVideo");
  };
  const playerTime = () => (video.current && videoSrc ? video.current.currentTime : src ? ytTime.current : null);

  // "+ Note" on the video and the N key: pause, and open the composer at this moment. Saving plays on.
  const noteHere = () => {
    const t = playerTime();
    const playing = video.current ? !video.current.paused : !!src && ytPlaying.current;
    if (playing) pausePlayer();
    notes.openCompose({
      kind: "note",
      source: t !== null ? "video" : "general",
      videoAt: t !== null ? Math.floor(t) : null,
      resume: playing,
    });
  };

  // The notes panel reaches the player through this (jump to a note, pause while writing, read the time). Set
  // after every render so it always uses the current video.
  useEffect(() => {
    noteHereRef.current = noteHere;
    registerPlayer({
      seek: (t) => void seek(t),
      pause: pausePlayer,
      play: () => {
        if (video.current) void video.current.play().catch(() => {});
        else send("playVideo");
      },
      time: playerTime,
    });
  });
  useEffect(() => () => registerPlayer(null), [registerPlayer]);

  // N writes a note (not while typing in a field). A YouTube video keeps the keys while it has focus.
  useEffect(() => {
    if (!notes.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "n" && e.key !== "N") || e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e.target)) return;
      e.preventDefault();
      noteHereRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notes.enabled]);

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
      const info = (data as { info?: { currentTime?: unknown; playerState?: unknown; duration?: unknown } } | null)?.info;
      if (!info || typeof info !== "object") return;
      if (typeof info.currentTime === "number") {
        ytTime.current = info.currentTime;
        followChapter(info.currentTime);
      }
      if (typeof info.duration === "number" && info.duration > 0) setDur(info.duration);
      if (typeof info.playerState === "number") ytPlaying.current = info.playerState === 1;
      if (info.playerState === 0) setDone();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [src, followChapter, setDone]);

  const qs = quizItems(part);
  // One correct option: single-answer questions scored under the exam's rules (progress.pick). Otherwise the
  // pick-n-of-m quiz (progress.quiz), as in the DAE guide.
  const single = format.correct === 1;
  const tally = single ? tallyPicks(format, qs.map(({ q, key }) => ({ key, correct: q.correct })), progress.pick) : null;
  const opens = openKeys(part);
  let graded = 0;
  let openPoints = 0;
  let openMax = 0;
  for (const { q, key } of opens) {
    const g = progress.grade?.[key];
    openMax += q.points;
    if (g !== undefined) {
      graded++;
      openPoints += g * q.points;
    }
  }

  // Notes (logged in only): a note about a question, a key point saved in one click, and the marks on the video.
  const noteOn = (key: string) => (notes.enabled ? () => notes.openCompose({ kind: "note", source: "quiz", ref: key }) : null);
  const saveKeyPoint = async (html: string, ref: string) => {
    if (savingKey) return;
    setSavingKey(ref);
    await notes.add({ body: plain(html).slice(0, NOTE_MAX), kind: "note", source: "keypoint", ref });
    setSavingKey(null);
  };
  // The panel holds the whole course's notes; the marks and "In your notes" are about this part only.
  const mine = notes.notes.filter((x) => x.part === part.n);
  const marks = notes.enabled && dur ? mine.filter((x) => x.video_at !== null && x.video_at <= dur) : [];

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
              clearStall();
              if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) setDur(e.currentTarget.duration);
              retried.current = false;
              // After a switch to the fallback the new file does not always start on its own.
              if (onStream.current && e.currentTarget.paused) void e.currentTarget.play().catch(() => {});
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
            onClick={() => seek(startAt ?? 0)}
            aria-label={`Play Part ${part.n}: ${plain(part.title)} (${part.dur})${startAt ? ` from ${clock(startAt)}` : ""}`}
          >
            <span className="th-pill">
              Part {part.n} · <Html html={part.unit} />
            </span>
            <span className="th-title">
              <Html html={part.title} />
            </span>
            <span className="th-meta">
              {startAt ? (
                <>Play from {clock(startAt)} (your note)</>
              ) : (
                <>
                  {part.dur}
                  {part.chapters.length > 1 && ` · ${part.chapters.length - 1} chapters`}
                </>
              )}
            </span>
            <span className="circle" aria-hidden="true">
              ▶
            </span>
            <span className="th-brand" aria-hidden="true">
              <LogoMark size={22} /> Unlecture
            </span>
          </button>
        ) : failed ? (
          <div className="soon failed" role="alert">
            <p>
              <b>The video could not load.</b> Some school and work networks block our video storage. Try mobile data
              or another Wi-Fi, then press Try again.
            </p>
            <button type="button" className="btn" onClick={retry}>
              Try again
            </button>
          </div>
        ) : (
          <div className="soon">Video coming soon</div>
        )}
      </div>

      {notes.enabled && hasVideo && (
        <div className="vtools">
          {marks.length > 0 && dur && (
            <div className="vmarks" role="group" aria-label="Your notes in the video">
              <span className="vm-track" aria-hidden="true" />
              {marks.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={m.kind === "question" ? "vm ask" : "vm"}
                  style={{ left: `${(100 * (m.video_at as number)) / dur}%` }}
                  onClick={() => seek(m.video_at as number)}
                  title={`${clock(m.video_at as number)} · ${m.body}`}
                  aria-label={`${m.kind === "question" ? "Question" : "Note"} at ${clock(m.video_at as number)}: ${m.body.slice(0, 80)}`}
                />
              ))}
            </div>
          )}
          <div className="vt-row">
            <NoteHere onNote={noteHere} live={!!(videoSrc || src)} />
            {notes.studyAvailable && (
              <button type="button" className="vt-study" aria-pressed={notes.study} onClick={notes.toggleStudy}>
                {notes.study ? "Exit study mode" : "Study mode"}
              </button>
            )}
          </div>
        </div>
      )}

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
            {part.recaps.map((r, i) => {
              const ref = `r${i}`;
              const saved = mine.some((x) => x.ref === ref);
              return (
                <div key={r} className="rp-row">
                  <Html html={r} block className="rp" />
                  {notes.enabled && (
                    <button
                      type="button"
                      className={saved ? "rp-save on" : "rp-save"}
                      disabled={saved || savingKey === ref}
                      onClick={() => saveKeyPoint(r, ref)}
                    >
                      {saved ? "✓ In your notes" : savingKey === ref ? "Saving…" : "+ Save to notes"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {qs.length > 0 && (
        <section className="sec" aria-labelledby={`quiz-${part.n}`}>
          <h2 id={`quiz-${part.n}`}>
            Quiz <span className="cnt">{qs.length} questions · {quizRule(format)}</span>
          </h2>
          {tally && (
            <p className="tally">
              {tally.answered > 0 ? (
                <>
                  Your score: <b>{fmtPoints(tally.points)}</b> of {pointsWord(tally.max)} · {tally.right} right ·{" "}
                  {tally.wrong} wrong · {tally.blank} blank
                </>
              ) : (
                <>Scoring as on the exam</>
              )}
              <span className="rule"> ({scoringRule(format)})</span>
            </p>
          )}
          {qs.map(({ q, key, label }) =>
            single ? (
              <SingleQuiz
                key={key}
                id={`q-${key}`}
                q={q}
                label={label}
                format={format}
                answer={progress.pick?.[key] ?? null}
                onCheck={(a) => {
                  update((p) => ({ ...p, pick: { ...p.pick, [key]: a } }));
                  notes.setLastQuestion(key);
                }}
                onReset={() =>
                  update((p) => {
                    const pick = { ...p.pick };
                    delete pick[key];
                    return { ...p, pick };
                  })
                }
                onWatch={q.at !== null && hasVideo ? () => seek(q.at as number) : null}
                onNote={noteOn(key)}
              />
            ) : (
              <Quiz
                key={key}
                id={`q-${key}`}
                q={q}
                n={format.correct}
                label={label}
                picks={progress.quiz[key] ?? null}
                onCheck={(picks) => {
                  update((p) => ({ ...p, quiz: { ...p.quiz, [key]: picks } }));
                  notes.setLastQuestion(key);
                }}
                onReset={() =>
                  update((p) => {
                    const quiz = { ...p.quiz };
                    delete quiz[key];
                    return { ...p, quiz };
                  })
                }
                onWatch={q.at !== null && hasVideo ? () => seek(q.at as number) : null}
                onNote={noteOn(key)}
              />
            ),
          )}
        </section>
      )}

      {opens.length > 0 && (
        <section className="sec" aria-labelledby={`open-${part.n}`}>
          <h2 id={`open-${part.n}`}>
            Open questions{" "}
            <span className="cnt">
              {opens.length} {opens.length === 1 ? "question" : "questions"} · write, then compare with the model answer
            </span>
          </h2>
          {graded > 0 && (
            <p className="tally">
              Self-graded: <b>{fmtPoints(round3(openPoints))}</b> of {pointsWord(openMax)} · {graded}/
              {opens.length} graded
            </p>
          )}
          {opens.map(({ q, key }, i) => (
            <OpenPractice
              key={`${key}-${rev}`}
              id={`o-${key}`}
              q={q}
              n={i + 1}
              value={progress.open?.[key] ?? ""}
              grade={progress.grade?.[key]}
              onText={(t) =>
                update((p) => {
                  const open = { ...p.open };
                  if (t.trim()) open[key] = t;
                  else delete open[key];
                  return { ...p, open };
                })
              }
              onGrade={(g) => {
                update((p) => ({ ...p, grade: { ...p.grade, [key]: g } }));
                notes.setLastQuestion(key);
              }}
              onNote={noteOn(key)}
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

// Pick n of the options (DAE: two of six), check, and see which were right.
function Quiz({
  id,
  q,
  n,
  label,
  picks,
  onCheck,
  onReset,
  onWatch,
  onNote,
}: {
  id: string;
  q: GuideQuestion;
  n: number; // options to pick
  label: string;
  picks: string[] | null;
  onCheck: (picks: string[]) => void;
  onReset: () => void;
  onWatch: (() => void) | null;
  onNote: (() => void) | null;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const checked = picks !== null;
  const shown = checked ? picks : sel;
  const right = checked ? picks.filter((x) => q.correct.includes(x)).length : 0;

  const toggle = (letter: string) => {
    if (checked) return;
    setSel((s) => (s.includes(letter) ? s.filter((x) => x !== letter) : s.length < n ? [...s, letter] : s));
  };

  return (
    <div className={`q${checked ? " checked" : ""}`}>
      <div className="qh">
        <span className={`src ${q.src}`}>{q.src === "video" ? "Video drill" : "New"}</span>
        {label}
        {onNote && (
          <button type="button" className="qn" onClick={onNote} aria-label="Add a note on this question">
            + Note<span className="qn-more"> on this question</span>
          </button>
        )}
      </div>
      {q.ctx && <Html html={q.ctx} block className="ctx" />}
      <Html id={`${id}-stem`} html={q.stem.replace(/^Q\d+\.\s*/, "")} block className="stem" />
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
            disabled={sel.length !== n}
            onClick={() => {
              onCheck([...sel].sort());
              setSel([]);
            }}
          >
            Check
          </button>
        )}
        <span role="status" className={`score s${right === n ? 2 : right > 0 ? 1 : 0}`}>
          {checked && (right === n ? `${n} / ${n} correct` : `${right} / ${n} · correct: ${q.correct.join(" and ")}`)}
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

// "+ Note at 4:12": the time follows the video (read twice a second here, so the rest of the guide does not
// re-render while it plays).
function NoteHere({ onNote, live }: { onNote: () => void; live: boolean }) {
  const { player } = useNotes();
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      const now = player()?.time();
      setT(typeof now === "number" ? Math.floor(now) : null);
    }, 500);
    return () => clearInterval(id);
  }, [live, player]);
  const at = live ? t : null;
  return (
    <button type="button" className="vt-note" onClick={onNote} aria-keyshortcuts="N">
      + Note{at !== null ? ` at ${clock(at)}` : ""}
      <kbd aria-hidden="true">N</kbd>
    </button>
  );
}
