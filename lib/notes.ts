// Notes for the exam: the shape of a note, the check for what may be saved, and small pure helpers shared by the
// guide part (notes panel), /app (all notes) and the print page. Table: public.notes (supabase/migrations/0005).

export type NoteKind = "note" | "question";
export type NoteSource = "general" | "video" | "quiz" | "keypoint";

export type Note = {
  id: string;
  body: string;
  kind: NoteKind;
  source: NoteSource;
  guide_id: string | null;
  part: number | null;
  video_at: number | null; // seconds into the part's video
  ref: string | null; // question key ("6-p1", open question "6-o0") or key point ("r0")
  created_at: string;
};

export type NoteInput = {
  body: string;
  kind?: NoteKind;
  source?: NoteSource;
  guideId?: string | null;
  part?: number | null;
  videoAt?: number | null;
  ref?: string | null;
};

export const NOTE_MAX = 500;
export const NOTE_COLUMNS = "id, body, kind, source, guide_id, part, video_at, ref, created_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^(\d{1,3}-[vpo]\d{1,3}|r\d{1,2})$/;
const KINDS: NoteKind[] = ["note", "question"];
const SOURCES: NoteSource[] = ["general", "video", "quiz", "keypoint"];

// The row to insert, or an error the student can act on. The client is never trusted.
export function cleanNote(input: unknown): { row: Omit<Note, "id" | "created_at"> } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Nothing to save." };
  const i = input as Record<string, unknown>;
  const body = typeof i.body === "string" ? i.body.trim() : "";
  if (!body) return { error: "Write your note first." };
  if (body.length > NOTE_MAX) return { error: `Keep it under ${NOTE_MAX} characters.` };
  const kind = KINDS.includes(i.kind as NoteKind) ? (i.kind as NoteKind) : "note";
  const guideId = typeof i.guideId === "string" && UUID.test(i.guideId) ? i.guideId.toLowerCase() : null;
  const intIn = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  const part = guideId ? intIn(i.part, 200) : null;
  const videoAt = part !== null ? intIn(typeof i.videoAt === "number" ? Math.floor(i.videoAt) : i.videoAt, 36000) : null;
  const ref = part !== null && typeof i.ref === "string" && REF.test(i.ref) ? i.ref : null;
  let source = SOURCES.includes(i.source as NoteSource) ? (i.source as NoteSource) : "general";
  if (part === null) source = "general";
  return { row: { body, kind, source, guide_id: guideId, part, video_at: videoAt, ref } };
}

// "4:12" for a moment in a video.
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// Notes grouped for display: by guide, then by part, newest first inside. "course" puts the groups in the order of
// the guides and their parts, General last (the print page); "recent" puts the group with the newest note first
// (/app, so a note just saved is at the top).
export function groupNotes<G extends { id: string }>(notes: Note[], guides: G[], order: "course" | "recent" = "course") {
  const pos = new Map(guides.map((g, i) => [g.id, i]));
  const groups = new Map<string, { key: string; guideId: string | null; part: number | null; notes: Note[] }>();
  for (const n of notes) {
    const gid = n.guide_id && pos.has(n.guide_id) ? n.guide_id : null;
    const key = `${gid ?? "-"}:${gid ? (n.part ?? "-") : "-"}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, guideId: gid, part: gid ? n.part : null, notes: [] }));
    g.notes.push(n);
  }
  const time = (n: Note) => Date.parse(n.created_at) || 0;
  const list = [...groups.values()].map((g) => ({ ...g, notes: g.notes.slice().sort((a, b) => time(b) - time(a)) }));
  if (order === "recent") return list.sort((a, b) => time(b.notes[0]) - time(a.notes[0]));
  const rank = (g: { guideId: string | null; part: number | null }) => [
    g.guideId === null ? 1e6 : (pos.get(g.guideId) ?? 1e5),
    g.part === null ? -1 : g.part,
  ];
  return list.sort((a, b) => {
    const [x1, y1] = rank(a);
    const [x2, y2] = rank(b);
    return x1 - x2 || y1 - y2;
  });
}

// What a note is about, in words, from its ref: "Quiz question", "Open question" or "Key point".
export function refLabel(ref: string | null) {
  if (!ref) return null;
  if (/^r\d/.test(ref)) return "Key point";
  return /-o\d/.test(ref) ? "Open question" : "Quiz question";
}

// Where a note leads in its guide: the video moment (?t=), the question or the key points, else the part.
export function noteHref(slug: string, n: Note) {
  if (n.part === null) return `/app/guides/${slug}`;
  const base = `/app/guides/${slug}/${n.part}`;
  if (n.video_at !== null) return `${base}?t=${n.video_at}`;
  if (n.ref && /^r\d/.test(n.ref)) return `${base}#rem-${n.part}`;
  if (n.ref) return `${base}#${/-o\d/.test(n.ref) ? "o" : "q"}-${n.ref}-stem`;
  return base;
}

// "17 Oct" (Madrid time, so the server and the browser show the same day).
export function noteDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
}
