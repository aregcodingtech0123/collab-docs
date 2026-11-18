// .txt -> TipTap JSON (native; no dependency).
// TODO: split on blank lines into paragraphs, preserve single newlines as hard breaks.

import type { TipTapDoc } from "@/types";

export function parseTxt(text: string): TipTapDoc {
  void text;
  // TODO: implement
  throw new Error("parseTxt is not implemented yet");
}
