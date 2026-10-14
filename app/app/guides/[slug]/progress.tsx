"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { saveGuideProgress, type GuideProgress } from "../actions";

export type Update = (fn: (p: GuideProgress) => GuideProgress) => void;
export type SaveState = "idle" | "saving" | "saved" | "error" | "full";

export const EMPTY_PROGRESS: GuideProgress = { done: {}, quiz: {} };

type GuideState = {
  slug: string;
  base: string; // URL of the course overview
  guest: boolean;
  progress: GuideProgress;
  update: Update;
  saveState: SaveState;
};

const GuideContext = createContext<GuideState | null>(null);

export const guideBase = (slug: string, guest: boolean) => (guest ? `/guides/${slug}` : `/app/guides/${slug}`);

// Lives in the guide's layout, so progress stays in memory while the student moves between the overview and the
// parts. Each change is saved to Supabase shortly after; saves run one after another and always send the newest
// state. In the free preview (guest) nothing is saved.
export function ProgressProvider({
  slug,
  guideId,
  guest,
  initial,
  children,
}: {
  slug: string;
  guideId: string;
  guest: boolean;
  initial: GuideProgress | null;
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState<GuideProgress>(() => initial ?? EMPTY_PROGRESS);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const latest = useRef(progress);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const r = await saveGuideProgress(guideId, latest.current).catch(() => ({ error: "offline", tooLarge: false }));
      if (!timer.current) setSaveState(r.tooLarge ? "full" : r.error ? "error" : "saved");
    });
  }, [guideId]);

  const update = useCallback<Update>(
    (fn) => {
      const next = fn(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      setProgress(next);
      if (guest) return;
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        save();
      }, 800);
    },
    [save, guest],
  );

  // Leaving the tab or the guide: save right away instead of waiting for the timer.
  useEffect(() => {
    const flush = () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      save();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [save]);

  const value = useMemo(
    () => ({ slug, base: guideBase(slug, guest), guest, progress, update, saveState }),
    [slug, guest, progress, update, saveState],
  );
  return <GuideContext value={value}>{children}</GuideContext>;
}

export function useGuide() {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide must be used inside ProgressProvider");
  return ctx;
}

export const saveLabel: Record<SaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved. Check your connection.",
  full: "Not saved: your answers are too long. Shorten an open answer.",
};

export const saveFailed = (s: SaveState) => s === "error" || s === "full";
