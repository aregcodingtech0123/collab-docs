"use client";

// Connects the Autosaver (lib/autosave.ts) to React: PATCHes the content, flushes
// when the tab is hidden, and warns before leaving only while there are unsaved changes.

import { useCallback, useEffect, useRef, useState } from "react";
import { Autosaver, type AutosaveState, type SaveResult } from "@/lib/autosave";
import type { TipTapDoc } from "@/types";

/** Browsers cap keepalive request bodies at 64 KB. */
const KEEPALIVE_LIMIT = 60_000;

async function saveContent(documentId: string, content: TipTapDoc): Promise<SaveResult> {
  const body = JSON.stringify({ content });
  let res: Response;
  try {
    res = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: body.length < KEEPALIVE_LIMIT, // survives the page being closed right after
    });
  } catch {
    return { ok: false, kind: "error", message: "You appear to be offline." };
  }

  if (res.ok) return { ok: true };
  if (res.status === 401) {
    return { ok: false, kind: "unauthorized", message: "Your session has ended." };
  }
  if (res.status === 403) {
    return { ok: false, kind: "unavailable", message: "You no longer have permission to edit this document." };
  }
  if (res.status === 404) {
    return { ok: false, kind: "unavailable", message: "This document is no longer available." };
  }
  if (res.status === 400) {
    // Our own validation message (e.g. the 1 MB limit) is safe and useful to show.
    const body = await res.json().catch(() => null);
    return { ok: false, kind: "error", message: body?.error?.message ?? "The document could not be saved." };
  }
  return { ok: false, kind: "error", message: "The server had a problem saving the document." };
}

export function useAutosave(options: {
  documentId: string;
  initialContent: TipTapDoc;
  /** Current editor content; read when a save is sent. */
  getContent: () => TipTapDoc | null;
  enabled: boolean;
}) {
  const { documentId, enabled } = options;
  const [state, setState] = useState<AutosaveState>({ status: "saved" });
  const saverRef = useRef<Autosaver<TipTapDoc> | null>(null);

  // Latest option values for the long-lived Autosaver, updated outside of render.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!enabled) return;

    const saver = new Autosaver<TipTapDoc>({
      initial: latest.current.initialContent,
      getValue: () => latest.current.getContent() ?? latest.current.initialContent,
      save: (content) => saveContent(documentId, content),
      onState: setState,
    });
    saverRef.current = saver;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saver.hasUnsaved()) {
        event.preventDefault();
        event.returnValue = ""; // required by some browsers to show the prompt
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      saverRef.current = null;
      saver.dispose(); // sends anything still pending (e.g. navigating away within the app)
    };
  }, [documentId, enabled]);

  const markDirty = useCallback(() => saverRef.current?.markDirty(), []);
  const flush = useCallback(() => void saverRef.current?.flush(), []);
  const retry = useCallback(() => void saverRef.current?.retry(), []);

  return { state, markDirty, flush, retry };
}
