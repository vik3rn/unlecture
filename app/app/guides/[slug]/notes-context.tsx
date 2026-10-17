"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { openKeys, plain, quizItems, type GuidePart } from "@/lib/guides";
import type { Note, NoteInput, NoteKind, NoteSource } from "@/lib/notes";
import { deleteNote, saveNote } from "../../notes-actions";

// Everything the notes panel shares with the rest of a guide part: the part's notes, saving and deleting them,
// the composer (what kind of note, about which question or video moment), the last quiz question the student
// answered (suggested for a new question), the video player (seek, pause, current time) and study mode
// (the video and the notes together in fullscreen). In the free preview (guest) notes are off.

export type QuizRef = { key: string; label: string; stem: string };
// The composer's settings. `tick` goes up each time something opens it, so the panel can focus the text box.
export type Compose = { kind: NoteKind; source: NoteSource; ref: string | null; videoAt: number | null; resume: boolean; tick: number };
const BLANK: Omit<Compose, "tick"> = { kind: "note", source: "general", ref: null, videoAt: null, resume: false };
type Player = { seek: (t: number) => void; pause: () => void; play: () => void; time: () => number | null };

type NotesState = {
  enabled: boolean;
  guideId: string;
  part: number;
  notes: Note[];
  error: string | null;
  questions: QuizRef[];
  add: (input: NoteInput) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  compose: Compose;
  openCompose: (c: Partial<Omit<Compose, "tick">>) => void;
  patchCompose: (c: Partial<Omit<Compose, "tick">>) => void;
  closeCompose: () => void;
  lastQuestion: string | null;
  setLastQuestion: (key: string) => void;
  registerPlayer: (p: Player | null) => void;
  player: () => Player | null;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  study: boolean;
  studyAvailable: boolean;
  toggleStudy: () => void;
  setRoot: (el: HTMLDivElement | null) => void; // the part's wrapper (video + notes), for study mode
};

const NotesContext = createContext<NotesState | null>(null);

const OFF: NotesState = {
  enabled: false,
  guideId: "",
  part: 0,
  notes: [],
  error: null,
  questions: [],
  add: async () => false,
  remove: async () => {},
  compose: { ...BLANK, tick: 0 },
  openCompose: () => {},
  patchCompose: () => {},
  closeCompose: () => {},
  lastQuestion: null,
  setLastQuestion: () => {},
  registerPlayer: () => {},
  player: () => null,
  sheetOpen: false,
  setSheetOpen: () => {},
  study: false,
  studyAvailable: false,
  toggleStudy: () => {},
  setRoot: () => {},
};

export function NotesProvider({
  enabled,
  guideId,
  part,
  initial,
  children,
}: {
  enabled: boolean;
  guideId: string;
  part: GuidePart;
  initial: Note[];
  children: React.ReactNode;
}) {
  const [notes, setNotes] = useState<Note[]>(initial);
  // A fresh list from the server (for example after deleting a note on /app) replaces the one kept in memory.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setNotes(initial);
  }
  const [error, setError] = useState<string | null>(null);
  const [compose, setCompose] = useState<Compose>({ ...BLANK, tick: 0 });
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [study, setStudy] = useState(false);
  const [studyAvailable, setStudyAvailable] = useState(false);
  const playerRef = useRef<Player | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const questions = useMemo<QuizRef[]>(
    () => [
      ...quizItems(part).map(({ q, key, label }) => ({ key, label, stem: plain(q.stem).replace(/^Q\d+\.\s*/, "") })),
      ...openKeys(part).map(({ q, key }, i) => ({ key, label: `Open question · ${i + 1}`, stem: plain(q.stem) })),
    ],
    [part],
  );

  const add = useCallback(
    async (input: NoteInput) => {
      setError(null);
      const r = await saveNote({ ...input, guideId, part: part.n });
      if (!r.note) {
        setError(r.error);
        return false;
      }
      const saved = r.note;
      setNotes((ns) => [saved, ...ns]);
      return true;
    },
    [guideId, part.n],
  );

  const remove = useCallback(async (id: string) => {
    setError(null);
    const r = await deleteNote(id);
    if (r.error) return setError(r.error);
    setNotes((ns) => ns.filter((n) => n.id !== id));
  }, []);

  const openCompose = useCallback((c: Partial<Omit<Compose, "tick">>) => {
    setCompose((prev) => ({ ...BLANK, ...c, tick: prev.tick + 1 }));
    setSheetOpen(true);
  }, []);
  const patchCompose = useCallback((c: Partial<Omit<Compose, "tick">>) => setCompose((prev) => ({ ...prev, ...c })), []);
  const closeCompose = useCallback(() => setCompose((prev) => ({ ...BLANK, tick: prev.tick })), []);
  const registerPlayer = useCallback((p: Player | null) => {
    playerRef.current = p;
  }, []);
  const player = useCallback(() => playerRef.current, []);
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
  }, []);

  // Study mode: the part's wrapper (video + notes) in fullscreen. Not on iPhone, which only lets a video go
  // fullscreen; the normal fullscreen button of the video works everywhere as before.
  useEffect(() => {
    if (!enabled) return;
    const can = typeof document !== "undefined" && !!document.fullscreenEnabled;
    const onChange = () => setStudy(!!document.fullscreenElement && document.fullscreenElement === rootRef.current);
    // Read once after mount (the server cannot know), then follow the fullscreen state.
    queueMicrotask(() => setStudyAvailable(can));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [enabled]);
  const toggleStudy = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void root.requestFullscreen().catch(() => {});
  }, []);

  const value = useMemo<NotesState>(
    () =>
      enabled
        ? {
            enabled,
            guideId,
            part: part.n,
            notes,
            error,
            questions,
            add,
            remove,
            compose,
            openCompose,
            patchCompose,
            closeCompose,
            lastQuestion,
            setLastQuestion,
            registerPlayer,
            player,
            sheetOpen,
            setSheetOpen,
            study,
            studyAvailable,
            toggleStudy,
            setRoot,
          }
        : OFF,
    [enabled, guideId, part.n, notes, error, questions, add, remove, compose, openCompose, patchCompose, closeCompose, lastQuestion,
      registerPlayer, player, sheetOpen, study, studyAvailable, toggleStudy, setRoot],
  );
  return <NotesContext value={value}>{children}</NotesContext>;
}

// Outside a provider (the free preview has none) notes are simply off.
export function useNotes(): NotesState {
  return useContext(NotesContext) ?? OFF;
}
