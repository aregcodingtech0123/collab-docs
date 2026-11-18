import { describe, it } from "vitest";

// Subject: src/lib/import/* (parsers + importFile entry point).

describe("importFile", () => {
  it.todo("picks the parser from the file extension (case-insensitive)");
  it.todo("rejects unsupported extensions");
  it.todo("rejects empty files");
  it.todo("rejects files larger than MAX_IMPORT_BYTES");
  it.todo("derives the document title from the file name without extension");
});

describe("parseTxt", () => {
  it.todo("turns blank-line separated blocks into paragraphs");
  it.todo("keeps single newlines as hard breaks");
  it.todo("handles CRLF line endings");
});

describe("parseMarkdown", () => {
  it.todo("maps headings, bold, italic, lists to TipTap nodes/marks");
  it.todo("does not let raw HTML/script through");
});

describe("parseDocx", () => {
  it.todo("maps headings, bold, italic, lists to TipTap nodes/marks");
  it.todo("rejects corrupt files with a friendly error");
});
