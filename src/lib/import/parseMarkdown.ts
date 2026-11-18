// .md -> TipTap JSON: marked -> HTML -> shared TipTap schema (see html.ts).
// Raw HTML inside the markdown is passed through by marked on purpose; the schema
// is what removes everything unsupported.

import { marked } from "marked";
import { htmlToDoc } from "@/lib/import/html";
import type { TipTapDoc } from "@/types";

export function parseMarkdown(markdown: string): TipTapDoc {
  const html = marked.parse(markdown, { async: false, gfm: true });
  return htmlToDoc(html);
}
