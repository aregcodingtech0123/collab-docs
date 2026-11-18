// Autosave state machine, independent of React, TipTap and fetch so it can be unit-tested.
//
// Guarantees:
//  - Debounced: a burst of edits becomes one save, `delayMs` after the last edit.
//  - Nothing is saved until markDirty() is called (so never on initial load), and a
//    save is skipped when the content equals what was last saved.
//  - At most ONE save is in flight. Edits made meanwhile are sent once, after it
//    finishes, and the value is read at send time, so older content can never
//    overwrite newer content.
//  - Permanent failures (signed out / document gone or no longer editable) stop
//    autosaving; temporary failures keep the edits and can be retried.

export type AutosaveStatus =
  | "saved"
  | "saving"
  | "unsaved"
  | "error"
  | "unauthorized"
  | "unavailable";

export interface AutosaveState {
  status: AutosaveStatus;
  /** Human-readable detail for error states. */
  message?: string;
}

export type SaveResult =
  | { ok: true }
  | { ok: false; kind: "error" | "unauthorized" | "unavailable"; message?: string };

export interface AutosaverOptions<T> {
  /** Content as loaded from the server (considered already saved). */
  initial: T;
  /** Current content. Called when a save is about to be sent. */
  getValue: () => T;
  save: (value: T) => Promise<SaveResult>;
  onState: (state: AutosaveState) => void;
  delayMs?: number;
  serialize?: (value: T) => string;
}

export const DEFAULT_AUTOSAVE_DELAY_MS = 800;

export class Autosaver<T> {
  private readonly getValue: () => T;
  private readonly save: (value: T) => Promise<SaveResult>;
  private readonly onState: (state: AutosaveState) => void;
  private readonly delayMs: number;
  private readonly serialize: (value: T) => string;

  private savedKey: string;
  private dirty = false;
  private stopped = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loop: Promise<void> | null = null;
  private current: AutosaveState = { status: "saved" };

  constructor(options: AutosaverOptions<T>) {
    this.getValue = options.getValue;
    this.save = options.save;
    this.onState = options.onState;
    this.delayMs = options.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS;
    this.serialize = options.serialize ?? ((v) => JSON.stringify(v));
    this.savedKey = this.serialize(options.initial);
  }

  /** Call whenever the user changed the content. */
  markDirty(): void {
    if (this.stopped) return;
    this.dirty = true;
    if (!this.loop) this.emit({ status: "unsaved" });
    this.schedule();
  }

  /** Send pending changes now (blur, tab hidden, ...). Resolves when everything is sent. */
  flush(): Promise<void> {
    this.clearTimer();
    return this.kick();
  }

  /** Try again after a failed save. */
  retry(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.clearTimer();
    return this.kick();
  }

  /** True while there are edits that the server has not acknowledged. */
  hasUnsaved(): boolean {
    return this.dirty || this.loop !== null;
  }

  /** Stop timers and callbacks (component unmounted); pending edits are still sent. */
  dispose(): void {
    this.clearTimer();
    this.disposed = true;
    void this.kick();
  }

  // ---- internals ---------------------------------------------------------------

  private schedule(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.kick();
    }, this.delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private kick(): Promise<void> {
    if (this.loop) return this.loop; // the running loop will pick up newer edits itself
    if (!this.dirty || this.stopped) return Promise.resolve();

    this.loop = (async () => {
      const failed = await this.run();
      this.loop = null;
      // An edit may have landed between the end of run() and here.
      if (!failed && this.dirty && !this.stopped) await this.kick();
    })();
    return this.loop;
  }

  /** Sends until nothing is dirty. Returns true if a save failed. */
  private async run(): Promise<boolean> {
    while (this.dirty && !this.stopped) {
      this.dirty = false;
      const value = this.getValue();
      const key = this.serialize(value);
      if (key === this.savedKey) continue; // edited back to the saved state: nothing to send

      this.emit({ status: "saving" });
      let result: SaveResult;
      try {
        result = await this.save(value);
      } catch {
        result = { ok: false, kind: "error", message: "Network error" };
      }

      if (result.ok) {
        this.savedKey = key;
        continue;
      }

      this.dirty = true; // the edits are still unsaved
      if (result.kind !== "error") this.stopped = true;
      this.emit({ status: result.kind, message: result.message });
      return true;
    }
    this.emit({ status: "saved" });
    return false;
  }

  private emit(state: AutosaveState): void {
    if (this.disposed) return;
    if (state.status === this.current.status && state.message === this.current.message) return;
    this.current = state;
    this.onState(state);
  }
}
