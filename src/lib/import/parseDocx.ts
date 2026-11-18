// .docx -> TipTap JSON: mammoth -> HTML -> shared TipTap schema (see html.ts).
// Throws whatever mammoth throws for a file that is not a readable .docx; the
// caller (parseImport) turns that into a readable 400.

import mammoth from "mammoth";
import { htmlToDoc } from "@/lib/import/html";
import type { TipTapDoc } from "@/types";

export async function parseDocx(data: Uint8Array): Promise<TipTapDoc> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer: Buffer.from(data) },
    {
      // mammoth ignores underline unless it is mapped.
      styleMap: ["u => u"],
      // Images are not supported: do not even inline them as (large) data: URIs.
      convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
    },
  );
  return htmlToDoc(html);
}
