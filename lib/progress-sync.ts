// How a guide's progress is saved and kept fresh (used by app/app/guides/[slug]/progress.tsx). No React and no
// browser globals unless given, so plain Node tests can drive it with fake timers.
//
// - Each change is saved shortly after (at once while the tab is hidden). Saves run one after another and always
//   send the newest state; a failed save is tried again a few times (not when the row is too large: the student
//   must shorten an answer first).
// - refresh() reads the saved progress again (the tab came back into view), but only when everything changed here
//   is saved: unsaved changes here are newer and win, and so does a change made while the request runs. This stops
//   a second tab or device from overwriting newer work (a submitted mock exam, for one) with an old copy.
import { sameProgress, type GuideProgress } from "./progress";

export type SaveResult = { error: string | null; tooLarge?: boolean };
export type SaveState = "idle" | "saving" | "saved" | "error" | "full";

export const SAVE_DELAY_MS = 800;
export const RETRY_MS = [3_000, 10_000, 30_000] as const;
export const REFRESH_GAP_MS = 5_000;

type Timer = ReturnType<typeof setTimeout>;

export type SyncDeps = {
  guest: boolean; // free preview: changes stay in the tab, nothing is saved or read
  save: (p: GuideProgress) => Promise<SaveResult>;
  load: () => Promise<GuideProgress | null | undefined>; // null: nothing saved yet; undefined: could not read
  show: (p: GuideProgress, fromServer: boolean) => void; // the progress to render
  state: (s: SaveState) => void;
  hidden?: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => Timer;
  clearTimer?: (t: Timer) => void;
};

export class ProgressSync {
  latest: GuideProgress;
  private d: SyncDeps;
  private timer: Timer | null = null;
  private chain: Promise<void> = Promise.resolve();
  private edits = 0; // changes made here
  private saved = 0; // how many of them the server has
  private retries = 0;
  private lastRefresh = -Infinity;

  constructor(initial: GuideProgress, deps: SyncDeps) {
    this.latest = initial;
    this.d = deps;
  }

  private hidden = () => (this.d.hidden ? this.d.hidden() : typeof document !== "undefined" && document.visibilityState === "hidden");
  private now = () => (this.d.now ? this.d.now() : Date.now());
  private setTimer = (fn: () => void, ms: number) => (this.d.setTimer ?? setTimeout)(fn, ms);
  private cancel() {
    if (this.timer) (this.d.clearTimer ?? clearTimeout)(this.timer);
    this.timer = null;
  }
  // One task at a time, in order; a failing task never blocks the ones after it.
  private queue(task: () => Promise<void>) {
    this.chain = this.chain.then(task).catch(() => {});
  }

  /** A change made in this tab. */
  change(fn: (p: GuideProgress) => GuideProgress) {
    const next = fn(this.latest);
    if (next === this.latest) return;
    this.latest = next;
    this.d.show(next, false);
    if (this.d.guest) return;
    this.edits++;
    this.retries = 0;
    this.d.state("saving");
    this.cancel();
    // A change while the tab is hidden (an answer draft flushed as the student leaves) is saved at once.
    if (this.hidden()) return this.save();
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.save();
    }, SAVE_DELAY_MS);
  }

  /** Leaving the tab or the guide: save now instead of waiting. */
  flush() {
    if (!this.timer) return;
    this.cancel();
    this.save();
  }

  /** Back online: save what is not saved yet without waiting for the next try. */
  online() {
    if (this.d.guest || this.saved === this.edits) return;
    this.cancel();
    this.save();
  }

  /** The tab came back into view: read the saved progress again if everything here is saved. */
  refresh() {
    if (this.d.guest) return;
    const now = this.now();
    if (now - this.lastRefresh < REFRESH_GAP_MS) return;
    this.lastRefresh = now;
    this.queue(async () => {
      const mark = this.edits;
      if (this.timer || this.saved !== mark) return;
      const fresh = await this.d.load().catch(() => undefined);
      if (!fresh || this.timer || this.edits !== mark) return;
      if (sameProgress(fresh, this.latest)) return;
      this.latest = fresh;
      this.d.show(fresh, true);
    });
  }

  /** Resolves when the queued saves and reads are done (tests). */
  idle() {
    return this.chain;
  }

  private save() {
    this.queue(async () => {
      const upTo = this.edits;
      const r: SaveResult = await this.d.save(this.latest).catch(() => ({ error: "offline", tooLarge: false }));
      if (!r.error) {
        this.saved = Math.max(this.saved, upTo);
        this.retries = 0;
      }
      if (this.timer) return; // a newer change is waiting; its save reports the state
      if (r.error && !r.tooLarge && this.retries < RETRY_MS.length) {
        this.timer = this.setTimer(() => {
          this.timer = null;
          this.save();
        }, RETRY_MS[this.retries++]);
      }
      this.d.state(r.tooLarge ? "full" : r.error ? "error" : "saved");
    });
  }
}
