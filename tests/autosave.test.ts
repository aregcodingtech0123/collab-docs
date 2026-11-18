import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver, type AutosaveState, type SaveResult } from "@/lib/autosave";

const DELAY = 800;

/** A save() whose completion the test controls. */
function deferredSave() {
  const calls: { value: string; resolve: (r: SaveResult) => void }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const save = (value: string) =>
    new Promise<SaveResult>((resolve) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push({
        value,
        resolve: (r) => {
          inFlight--;
          resolve(r);
        },
      });
    });
  return { save, calls, maxInFlight: () => maxInFlight };
}

function setup(initial = "v0", save: (v: string) => Promise<SaveResult> = async () => ({ ok: true })) {
  let content = initial;
  const states: AutosaveState[] = [];
  const saveSpy = vi.fn(save);
  const saver = new Autosaver<string>({
    initial,
    getValue: () => content,
    save: saveSpy,
    onState: (s) => states.push(s),
    delayMs: DELAY,
    serialize: (v) => v,
  });
  return {
    saver,
    saveSpy,
    states,
    statuses: () => states.map((s) => s.status),
    edit: (value: string) => {
      content = value;
      saver.markDirty();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("debouncing", () => {
  it("does not save anything on construction or while idle", async () => {
    const t = setup();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.saveSpy).not.toHaveBeenCalled();
    expect(t.states).toEqual([]);
    expect(t.saver.hasUnsaved()).toBe(false);
  });

  it("saves once, DELAY ms after the last edit, with the latest content", async () => {
    const t = setup();
    t.edit("a");
    await vi.advanceTimersByTimeAsync(500);
    t.edit("ab");
    await vi.advanceTimersByTimeAsync(500);
    t.edit("abc");
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(t.saveSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.saveSpy).toHaveBeenCalledTimes(1);
    expect(t.saveSpy).toHaveBeenCalledWith("abc");
  });

  it("goes unsaved -> saving -> saved", async () => {
    const t = setup();
    t.edit("a");
    expect(t.statuses()).toEqual(["unsaved"]);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.statuses()).toEqual(["unsaved", "saving", "saved"]);
    expect(t.saver.hasUnsaved()).toBe(false);
  });

  it("reports unsaved changes between the edit and the save", async () => {
    const t = setup();
    t.edit("a");
    expect(t.saver.hasUnsaved()).toBe(true);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.saver.hasUnsaved()).toBe(false);
  });

  it("does not save when the content was edited back to the saved version", async () => {
    const t = setup("v0");
    t.edit("changed");
    t.edit("v0");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.saveSpy).not.toHaveBeenCalled();
    expect(t.statuses().at(-1)).toBe("saved");
  });

  it("does not save the same content twice", async () => {
    const t = setup();
    t.edit("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    t.edit("a"); // a no-op "change"
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.saveSpy).toHaveBeenCalledTimes(1);
  });
});

describe("one request in flight at a time", () => {
  it("sends edits made during a save once, after it finishes, newest content last", async () => {
    const d = deferredSave();
    const t = setup("v0", d.save);

    t.edit("first");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(d.calls.map((c) => c.value)).toEqual(["first"]);

    // Edits while the first request is still pending, including a debounce firing.
    t.edit("second");
    await vi.advanceTimersByTimeAsync(300);
    t.edit("third");
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(d.calls).toHaveLength(1); // still only the first request, nothing overlapped

    d.calls[0].resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(d.calls.map((c) => c.value)).toEqual(["first", "third"]); // "second" was skipped

    d.calls[1].resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(d.maxInFlight()).toBe(1);
    expect(t.statuses().at(-1)).toBe("saved");
    expect(t.saver.hasUnsaved()).toBe(false);
  });

  it("stays 'saving' (not 'saved') while a follow-up save is pending", async () => {
    const d = deferredSave();
    const t = setup("v0", d.save);
    t.edit("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    t.edit("b");
    d.calls[0].resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.statuses()).not.toContain("saved");
    expect(t.states.at(-1)?.status).toBe("saving");
    d.calls[1].resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.states.at(-1)?.status).toBe("saved");
  });
});

describe("flush", () => {
  it("sends pending changes immediately and resolves when done", async () => {
    const t = setup();
    t.edit("a");
    await t.saver.flush();
    expect(t.saveSpy).toHaveBeenCalledWith("a");
    expect(t.saver.hasUnsaved()).toBe(false);
    // the debounce timer was cancelled: no second save later
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(t.saveSpy).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when nothing changed", async () => {
    const t = setup();
    await t.saver.flush();
    expect(t.saveSpy).not.toHaveBeenCalled();
  });

  it("while a save is in flight, waits for it and for the newer content", async () => {
    const d = deferredSave();
    const t = setup("v0", d.save);
    t.edit("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    t.edit("b");
    const flushed = t.saver.flush();
    d.calls[0].resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    d.calls[1].resolve({ ok: true });
    await flushed;
    expect(d.calls.map((c) => c.value)).toEqual(["a", "b"]);
    expect(d.maxInFlight()).toBe(1);
  });
});

describe("failures", () => {
  it("keeps the edits and reports an error, then retry() succeeds", async () => {
    let fail = true;
    const t = setup("v0", async () =>
      fail ? { ok: false, kind: "error", message: "Server error" } : { ok: true },
    );
    t.edit("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.states.at(-1)).toEqual({ status: "error", message: "Server error" });
    expect(t.saver.hasUnsaved()).toBe(true);

    fail = false;
    await t.saver.retry();
    expect(t.saveSpy).toHaveBeenCalledTimes(2);
    expect(t.states.at(-1)?.status).toBe("saved");
    expect(t.saver.hasUnsaved()).toBe(false);
  });

  it("does not hammer the server after an error (no automatic retry loop)", async () => {
    const t = setup("v0", async () => ({ ok: false, kind: "error" }));
    t.edit("a");
    await vi.advanceTimersByTimeAsync(DELAY * 20);
    expect(t.saveSpy).toHaveBeenCalledTimes(1);
  });

  it("tries again on the next edit after an error", async () => {
    let fail = true;
    const t = setup("v0", async () => (fail ? { ok: false, kind: "error" } : { ok: true }));
    t.edit("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    fail = false;
    t.edit("ab");
    expect(t.states.at(-1)?.status).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.saveSpy).toHaveBeenLastCalledWith("ab");
    expect(t.states.at(-1)?.status).toBe("saved");
  });

  it("treats a thrown save() as a retryable error", async () => {
    const t = setup("v0", async () => {
      throw new Error("offline");
    });
    t.edit("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.states.at(-1)).toEqual({ status: "error", message: "Network error" });
    expect(t.saver.hasUnsaved()).toBe(true);
  });

  it.each(["unauthorized", "unavailable"] as const)("stops autosaving after %s", async (kind) => {
    const t = setup("v0", async () => ({ ok: false, kind, message: "nope" }));
    t.edit("a");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(t.states.at(-1)).toEqual({ status: kind, message: "nope" });

    t.edit("ab");
    await vi.advanceTimersByTimeAsync(DELAY * 5);
    await t.saver.flush();
    await t.saver.retry();
    expect(t.saveSpy).toHaveBeenCalledTimes(1);
    expect(t.states.at(-1)?.status).toBe(kind); // the message is not overwritten by "unsaved"
    expect(t.saver.hasUnsaved()).toBe(true); // the user can still be warned before leaving
  });
});

describe("dispose", () => {
  it("still sends pending edits but stops reporting state", async () => {
    const t = setup();
    t.edit("a");
    const before = t.states.length;
    t.saver.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.saveSpy).toHaveBeenCalledWith("a");
    expect(t.states.length).toBe(before);
  });

  it("cancels the debounce timer", async () => {
    const t = setup();
    t.saver.dispose();
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(t.saveSpy).not.toHaveBeenCalled();
  });
});
