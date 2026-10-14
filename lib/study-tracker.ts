import { ActiveClock, chunkSeconds } from "@/lib/guide-time";

// Browser only (used by app/app/guides/[slug]/study-timer.tsx). Measures active study time in a guide and sends it
// to POST /api/guide-time: about once a minute, when the tab is hidden or the page closes, and whenever the caller
// flushes (route change, unmount). Only the guide, the part and a number of seconds are sent. Time counts while
// the tab is visible and the student either did something in the last 2 minutes or a video is playing. No timer
// runs while the tab is hidden, and every failure is silent.
const TICK_MS = 5_000;
const FLUSH_MS = 60_000;
const YT_ORIGIN = "https://www.youtube-nocookie.com";
const INPUTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
const MEDIA = ["play", "playing", "pause", "ended", "emptied"] as const;

// In the page the student sees: pages hidden by client-side navigation keep their DOM (display: none).
const shown = (el: Element | null | undefined) => !!el && el.isConnected && el.getClientRects().length > 0;

export function trackStudyTime(guideId: string, getPart: () => number) {
  const now0 = performance.now();
  const clock = new ActiveClock(now0, document.visibilityState === "visible");
  const videos = new Set<HTMLVideoElement>();
  let yt: { frame: HTMLIFrameElement; playing: boolean } | null = null;
  let lastFlush = now0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let off = false; // logged out, or migration 0004 not run yet: stop sending

  const playing = () => {
    for (const v of videos) if (!v.isConnected || v.paused || v.ended) videos.delete(v);
    for (const v of videos) if (shown(v)) return true;
    return !!yt?.playing && shown(yt.frame);
  };

  const send = (seconds: number, part: number) => {
    for (const s of chunkSeconds(seconds)) {
      if (off) return;
      fetch("/api/guide-time", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guideId, part, seconds: s }),
      })
        .then((r) => {
          if (r.status === 401 || r.status === 503) off = true;
        })
        .catch(() => {});
    }
  };

  // Sends the seconds counted so far for the current part (the caller flushes BEFORE switching parts).
  const flush = () => {
    const now = performance.now();
    lastFlush = now;
    send(clock.take(now), getPart());
  };

  const tick = () => {
    const now = performance.now();
    clock.setPlaying(now, playing());
    if (now - lastFlush >= FLUSH_MS) flush();
  };
  const start = () => {
    if (!timer && document.visibilityState === "visible") timer = setInterval(tick, TICK_MS);
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const onInput = () => clock.input(performance.now());
  const onMedia = (e: Event) => {
    if (!(e.target instanceof HTMLVideoElement)) return;
    if (e.type === "play" || e.type === "playing") videos.add(e.target);
    clock.setPlaying(performance.now(), playing());
  };
  // The YouTube fallback player reports its state by postMessage (part-content.tsx starts the "listening").
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== YT_ORIGIN) return;
    let data: unknown;
    try {
      data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }
    const d = data as { event?: unknown; info?: unknown } | null;
    const state = d?.event === "onStateChange" ? d.info : (d?.info as { playerState?: unknown } | null | undefined)?.playerState;
    if (typeof state !== "number" || state === 3) return; // 3 = buffering: keep the last state
    const frame = Array.from(document.querySelectorAll("iframe")).find((f) => f.contentWindow === e.source);
    if (!frame) return;
    yt = { frame, playing: state === 1 };
    clock.setPlaying(performance.now(), playing());
  };
  const onVisibility = () => {
    const visible = document.visibilityState === "visible";
    clock.setVisible(performance.now(), visible);
    if (visible) {
      lastFlush = performance.now();
      start();
    } else {
      stopTimer();
      flush();
    }
  };

  const opts = { capture: true, passive: true };
  for (const t of INPUTS) document.addEventListener(t, onInput, opts);
  for (const t of MEDIA) document.addEventListener(t, onMedia, true); // media events do not bubble
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onVisibility);
  window.addEventListener("pagehide", flush);
  window.addEventListener("message", onMessage);
  start();

  return {
    flush,
    // Removes every listener and the timer, then sends what is left.
    stop() {
      for (const t of INPUTS) document.removeEventListener(t, onInput, opts);
      for (const t of MEDIA) document.removeEventListener(t, onMedia, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("message", onMessage);
      stopTimer();
      flush();
    },
  };
}
