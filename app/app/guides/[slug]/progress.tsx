"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cleanProgress } from "@/lib/progress";
import { ProgressSync, type SaveState } from "@/lib/progress-sync";
import { saveGuideProgress, type GuideProgress } from "../actions";

export type { SaveState };
export type Update = (fn: (p: GuideProgress) => GuideProgress) => void;

export const EMPTY_PROGRESS: GuideProgress = { done: {}, quiz: {} };

type GuideState = {
  slug: string;
  base: string; // URL of the course overview
  guest: boolean;
  progress: GuideProgress;
  update: Update;
  saveState: SaveState;
  // Goes up when the progress was replaced by a newer version from the server (another tab or device). Components
  // that keep a draft of their own (open answers) use it in their key, so they start again from the new text.
  rev: number;
};

const GuideContext = createContext<GuideState | null>(null);

export const guideBase = (slug: string, guest: boolean) => (guest ? `/guides/${slug}` : `/app/guides/${slug}`);

// The saved progress (app/api/guide-progress): null when nothing is saved yet, undefined when it could not be read.
async function loadProgress(guideId: string): Promise<GuideProgress | null | undefined> {
  try {
    const r = await fetch(`/api/guide-progress?guide=${encodeURIComponent(guideId)}`, { cache: "no-store" });
    if (!r.ok) return undefined;
    const { progress } = (await r.json()) as { progress?: unknown };
    return progress == null ? null : (cleanProgress(progress) ?? undefined);
  } catch {
    return undefined;
  }
}

// Lives in the guide's layout, so progress stays in memory while the student moves between the overview and the
// parts. Saving, retrying and reading the saved progress again when the tab comes back into view are in
// lib/progress-sync.ts. In the free preview (guest) nothing is saved or read.
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
  const [rev, setRev] = useState(0);
  const [sync] = useState(
    () =>
      new ProgressSync(initial ?? EMPTY_PROGRESS, {
        guest,
        save: (p) => saveGuideProgress(guideId, p),
        load: () => loadProgress(guideId),
        show: (p, fromServer) => {
          setProgress(p);
          if (fromServer) setRev((x) => x + 1);
        },
        state: setSaveState,
      }),
  );

  const update = useCallback<Update>((fn) => sync.change(fn), [sync]);

  // Leaving the tab or the guide: save right away. Coming back: read the saved progress again.
  const shownBefore = useRef(false);
  useEffect(() => {
    const refresh = () => sync.refresh();
    const online = () => sync.online();
    const onVisibility = () => (document.visibilityState === "hidden" ? sync.flush() : sync.refresh());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", online);
    // Shown again after client-side navigation kept the guide hidden (<Activity>): it may be out of date.
    if (shownBefore.current) sync.refresh();
    shownBefore.current = true;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", online);
      sync.flush();
    };
  }, [sync]);

  const value = useMemo(
    () => ({ slug, base: guideBase(slug, guest), guest, progress, update, saveState, rev }),
    [slug, guest, progress, update, saveState, rev],
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
