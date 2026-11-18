// HTML -> TipTap JSON, for the markdown and docx importers.
//
// We do NOT sanitize the HTML ourselves. generateJSON() parses it with the shared
// extension schema (lib/tiptap.ts); anything that schema has no node or mark for
// (script, style, img, iframe, table, a, code, ...) is simply not representable
// and is dropped. Text inside dropped *inline/structural* elements survives as
// plain paragraphs (e.g. table cells); <script>/<style> contents are ignored.

import { generateJSON } from "@tiptap/html/server";
import { createExtensions } from "@/lib/tiptap";
import type { TipTapDoc } from "@/types";

const extensions = createExtensions();

export function htmlToDoc(html: string): TipTapDoc {
  const doc = generateJSON(html, extensions) as TipTapDoc;
  // An element that only held something unsupported (e.g. <p><img></p>) leaves an empty
  // paragraph behind; drop those instead of putting blank gaps where images were.
  const content = (doc.content ?? []).filter((n) => !(n.type === "paragraph" && !n.content?.length));
  return { ...doc, content };
}

/** True if the document contains at least one non-whitespace character of text. */
export function hasText(node: { text?: string; content?: unknown[] }): boolean {
  if (typeof node.text === "string" && node.text.trim() !== "") return true;
  return (node.content ?? []).some((child) => hasText(child as { text?: string; content?: unknown[] }));
}
