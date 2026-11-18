// .docx -> TipTap JSON.
// TODO: mammoth.convertToHtml({ buffer }) -> generateJSON() with the shared extensions.

import type { TipTapDoc } from "@/types";

export async function parseDocx(buffer: Buffer): Promise<TipTapDoc> {
  void buffer;
  // TODO: implement
  throw new Error("parseDocx is not implemented yet");
}
