"use client";

import { useSyncExternalStore } from "react";

// Minute clock for the countdown; null on the server so the first render matches.
const subscribeMinute = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

export function Countdown({ exam, className }: { exam: string; className?: string }) {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, noMinute);
  if (minute === null) return <span className={className} />;
  const ms = Date.parse(exam) - minute * 60_000;
  if (ms <= 0) return <span className={className}>Exam day: good luck!</span>;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return (
    <span className={className}>
      Exam in {d} d {h} h
    </span>
  );
}
