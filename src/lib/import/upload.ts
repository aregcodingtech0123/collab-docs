// Reads the uploaded file out of a multipart/form-data request, refusing oversized
// bodies without buffering them.
//
// Why "drain": if a server answers (413) and hangs up while the client is still
// sending, the client sees a connection reset / truncated response instead of the
// 413. So a moderately oversized upload is read and DISCARDED (nothing is kept in
// memory) up to DRAIN_LIMIT_BYTES, after which the client gets a clean 413. A body
// that is declared (Content-Length) or turns out to be bigger than that is cut off
// immediately; such a client may see a connection error, which is acceptable for
// something that is plainly not a file import.

import { ApiError } from "@/lib/errors";
import { MAX_IMPORT_BYTES } from "@/lib/import/limits";

/** The file plus multipart framing (boundaries, headers, other fields). */
const MAX_BODY_BYTES = MAX_IMPORT_BYTES + 64 * 1024;
/** How much of an oversized body we are willing to read and throw away. */
export const DRAIN_LIMIT_BYTES = 16 * 1024 * 1024;

const tooLarge = () => new ApiError(413, "file_too_large", "This file is too large. The limit is 2 MB.");

async function readBodyWithLimit(request: Request): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > DRAIN_LIMIT_BYTES) throw tooLarge();

  if (!request.body) throw new ApiError(400, "no_file", "No file was uploaded.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > DRAIN_LIMIT_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    if (total <= MAX_BODY_BYTES) chunks.push(value); // past the cap: keep reading, keep nothing
  }
  if (total > MAX_BODY_BYTES) throw tooLarge();
  return Buffer.concat(chunks);
}

export async function readUploadedFile(request: Request): Promise<{ name: string; data: Uint8Array }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ApiError(400, "invalid_upload", 'Upload the file as multipart/form-data in the field "file".');
  }

  const body = await readBodyWithLimit(request);

  let form: FormData;
  try {
    form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new ApiError(400, "invalid_upload", "The upload couldn't be read. Please try again.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiError(400, "no_file", 'No file was uploaded. Send it in the form field "file".');
  }
  if (file.size > MAX_IMPORT_BYTES) throw tooLarge();

  return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
}
