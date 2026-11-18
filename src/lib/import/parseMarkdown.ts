// .md -> TipTap JSON.
// TODO: marked -> HTML (sanitised) -> generateJSON() with the shared extensions.

import type { TipTapDoc } from "@/types";

export async function parseMarkdown(markdown: string): Promise<TipTapDoc> {
  void markdown;
  // TODO: implement
  throw new Error("parseMarkdown is not implemented yet");
}
