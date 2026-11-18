// Import entry point: picks a parser by file extension, enforces type/size limits,
// and guarantees the result passes the same content validation as PATCH /api/documents/:id.
// Every failure is an ApiError (400/413) with a readable message; nothing here should 500.

import { ZodError } from "zod";
import { ApiError, formatZodError } from "@/lib/errors";
import { hasText } from "@/lib/import/html";
import {
  MAX_IMPORT_BYTES,
  UNSUPPORTED_TYPE_MESSAGE,
  extensionOf,
  isSupportedExtension,
  titleFromFilename,
} from "@/lib/import/limits";
import { parseDocx } from "@/lib/import/parseDocx";
import { parseMarkdown } from "@/lib/import/parseMarkdown";
import { parseTxt } from "@/lib/import/parseTxt";
import { MAX_CONTENT_BYTES, tiptapDocSchema } from "@/lib/validation";
import type { TipTapDoc } from "@/types";

export * from "@/lib/import/limits";

export interface ImportResult {
  title: string;
  content: TipTapDoc;
}

const EMPTY_MESSAGE = "The file is empty. Choose a file that contains some text.";
const NO_TEXT_MESSAGE = "No importable text was found in this file.";
const NOT_TEXT_MESSAGE = "This file doesn't look like a text file.";
const CONTENT_TOO_LARGE_MESSAGE =
  "The text in this file is too large for one document (the limit is about 1 MB of text, even though files up to 2 MB are accepted). Split the file into smaller parts and import them separately.";
const BAD_DOCX_MESSAGE = "This .docx file couldn't be read. Make sure it's a valid Word document.";

function decodeText(data: Uint8Array): string {
  // A NUL byte means binary data (e.g. a renamed image), not text.
  if (data.includes(0)) throw new ApiError(400, "not_text", NOT_TEXT_MESSAGE);
  return new TextDecoder("utf-8").decode(data).replace(/^﻿/, ""); // lenient; strips a BOM
}

export async function parseImport(filename: string, data: Uint8Array): Promise<ImportResult> {
  const ext = extensionOf(filename);
  if (!isSupportedExtension(ext)) {
    throw new ApiError(400, "unsupported_file_type", UNSUPPORTED_TYPE_MESSAGE);
  }
  if (data.byteLength === 0) throw new ApiError(400, "empty_file", EMPTY_MESSAGE);
  if (data.byteLength > MAX_IMPORT_BYTES) {
    throw new ApiError(413, "file_too_large", "This file is too large. The limit is 2 MB.");
  }

  let content: TipTapDoc;
  switch (ext) {
    case ".txt": {
      const text = decodeText(data);
      if (text.trim() === "") throw new ApiError(400, "empty_file", EMPTY_MESSAGE);
      content = parseTxt(text);
      break;
    }
    case ".md": {
      const text = decodeText(data);
      if (text.trim() === "") throw new ApiError(400, "empty_file", EMPTY_MESSAGE);
      content = parseMarkdown(text);
      break;
    }
    case ".docx": {
      try {
        content = await parseDocx(data);
      } catch {
        throw new ApiError(400, "invalid_docx", BAD_DOCX_MESSAGE);
      }
      break;
    }
  }

  // Parsing can leave nothing behind, e.g. a markdown file that is only an image.
  if (!hasText(content)) throw new ApiError(400, "no_text", NO_TEXT_MESSAGE);

  // A file within the 2 MB limit can still produce more than the 1 MB a document may hold
  // (formatting adds JSON overhead). Say so explicitly instead of a generic validation error.
  if (new TextEncoder().encode(JSON.stringify(content)).length > MAX_CONTENT_BYTES) {
    throw new ApiError(400, "content_too_large", CONTENT_TOO_LARGE_MESSAGE);
  }

  try {
    content = tiptapDocSchema.parse(content) as unknown as TipTapDoc;
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ApiError(400, "invalid_content", `This file can't be imported: ${formatZodError(err)}.`);
    }
    throw err;
  }

  return { title: titleFromFilename(filename), content };
}
