// Saved / Saving… / Unsaved changes / Couldn't save · Retry (and the "stopped" states).

import Link from "next/link";
import type { AutosaveState } from "@/lib/autosave";

export default function SaveStatus({ state, onRetry }: { state: AutosaveState; onRetry: () => void }) {
  let content: React.ReactNode;
  let tone = "text-zinc-500";

  switch (state.status) {
    case "saved":
      content = "Saved";
      break;
    case "saving":
      content = "Saving…";
      break;
    case "unsaved":
      content = "Unsaved changes";
      break;
    case "error":
      tone = "text-red-700";
      content = (
        <>
          Couldn&apos;t save ·{" "}
          <button type="button" onClick={onRetry} className="font-medium underline hover:no-underline">
            Retry
          </button>
          {state.message && <span className="block text-xs font-normal">{state.message}</span>}
        </>
      );
      break;
    case "unauthorized":
      tone = "text-red-700";
      content = (
        <>
          Your session has ended, so changes can&apos;t be saved.{" "}
          <Link href="/login" className="font-medium underline hover:no-underline">
            Sign in again
          </Link>
        </>
      );
      break;
    case "unavailable":
      tone = "text-red-700";
      content = (
        <>
          {state.message ?? "This document is no longer available."} Your latest changes were not saved.{" "}
          <Link href="/documents" className="font-medium underline hover:no-underline">
            Back to documents
          </Link>
        </>
      );
      break;
  }

  return (
    <span role="status" aria-live="polite" data-save-status={state.status} className={`text-sm ${tone}`}>
      {content}
    </span>
  );
}
