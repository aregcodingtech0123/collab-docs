// .txt -> TipTap JSON (native; no dependency).
//   - a blank line (or several) starts a new paragraph
//   - a single newline inside a paragraph becomes a hard break

import type { TipTapDoc, TipTapNode } from "@/types";

export function parseTxt(text: string): TipTapDoc {
  const normalized = text.replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n[^\S\n]*\n\s*/); // blank (or whitespace-only) line(s)

  const content: TipTapNode[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.replace(/\s+$/, ""));
    // Trim empty lines at the edges of the block, keep the ones in the middle.
    while (lines.length && lines[0].trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length === 0) continue;

    const inline: TipTapNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type: "hardBreak" });
      if (line !== "") inline.push({ type: "text", text: line }); // text nodes cannot be empty
    });
    content.push({ type: "paragraph", content: inline });
  }

  return { type: "doc", content };
}
