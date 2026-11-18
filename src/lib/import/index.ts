// Import entry point: picks a parser by file extension and enforces type/size limits.
// TODO: implement importFile(); reject unsupported extensions, empty files and
// files over MAX_IMPORT_BYTES with an ApiError (400/413).

import type { TipTapDoc } from "@/types";

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".docx"] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/** Upload size cap. Vercel Hobby limits request bodies to ~4.5 MB. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export interface ImportResult {
  title: string;
  content: TipTapDoc;
}

export async function importFile(file: File): Promise<ImportResult> {
  void file;
  // TODO: implement
  throw new Error("importFile is not implemented yet");
}
