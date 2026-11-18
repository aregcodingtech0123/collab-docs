// Import limits and filename helpers. Dependency-free, so client components
// (ImportButton) can use them without pulling mammoth / marked into the bundle.

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".docx"] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/** Upload size cap. (Vercel Hobby also limits request bodies to ~4.5 MB.) */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const FALLBACK_TITLE = "Imported document";
export const MAX_TITLE_CHARS = 200;

/** Shown in the UI next to the Import button. */
export const IMPORT_LIMITS_TEXT = ".txt, .md and .docx files up to 2 MB. Very large text (over about 1 MB) is rejected.";
export const UNSUPPORTED_TYPE_MESSAGE = "Unsupported file type. Use .txt, .md or .docx.";

/** Last path segment (browsers send a bare name, but never trust that). */
function baseName(filename: string): string {
  return filename.split(/[\\/]/).pop() ?? "";
}

/** ".md" for "Notes.MD", "" if there is no extension. Case-insensitive. */
export function extensionOf(filename: string): string {
  const base = baseName(filename);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/** Document title from a filename: no extension, tidy whitespace, <= 200 chars, with a fallback. */
export function titleFromFilename(filename: string): string {
  const base = baseName(filename);
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;

  let title = stem
    .replace(/[\u0000-\u001f\u007f]+/g, " ") // control characters / newlines
    .replace(/\s+/g, " ")
    .trim();

  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS);
    // Do not leave half of a surrogate pair (emoji) at the cut.
    const last = title.charCodeAt(title.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) title = title.slice(0, -1);
    title = title.trim();
  }
  return title || FALLBACK_TITLE;
}
