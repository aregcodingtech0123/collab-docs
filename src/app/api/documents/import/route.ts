// POST /api/documents/import: multipart upload (.txt/.md/.docx, <= 2 MB) -> new document
// owned by the caller. The parsing rules live in lib/import (parseImport).

import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { parseImport } from "@/lib/import";
import { readUploadedFile } from "@/lib/import/upload";

export async function POST(request: Request) {
  try {
    // Authenticate before reading (potentially large) request bodies.
    const user = await requireUser();
    const { name, data } = await readUploadedFile(request);
    const { title, content } = await parseImport(name, data);

    const [row] = await getDb()
      .insert(schema.documents)
      .values({ ownerId: user.id, title, content })
      .returning({ id: schema.documents.id, title: schema.documents.title });

    return Response.json({ document: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
