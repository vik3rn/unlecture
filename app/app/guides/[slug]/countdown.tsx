"use client";

import { useSyncExternalStore } from "react";

// Minute clock for the countdown; null on the server so the first render matches.
const subscribeMinute = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

// Time left until `at` (epoch ms): "in 2 d 21 h", "in 3 h 20 min", or a short note once it has started.
export function Countdown({ at, className }: { at: number; className?: string }) {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, noMinute);
  if (minute === null) return null;
  const ms = at - minute * 60_000;
  let text: string;
  if (ms <= -6 * 3_600_000) text = "exam is over";
  else if (ms <= 0) text = "good luck!";
  else {
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    const min = Math.floor((ms % 3_600_000) / 60_000);
    text = d > 0 ? `in ${d} d ${h} h` : h > 0 ? `in ${h} h ${min} min` : `in ${min} min`;
  }
  return <span className={className}>{text}</span>;
}
