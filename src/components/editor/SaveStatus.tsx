// Saved / Saving / Error indicator.
// TODO: style per state and announce changes (aria-live).

import type { SaveState } from "@/types";

const LABELS: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  error: "Error saving",
};

export default function SaveStatus({ state }: { state: SaveState }) {
  return <span aria-live="polite">{LABELS[state]}</span>;
}
