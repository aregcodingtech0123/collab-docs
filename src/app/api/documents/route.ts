// GET /api/documents: { owned, shared } (no content). POST /api/documents: create a document.

import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { listDocuments, serializeDocument } from "@/lib/documents";
import { handleApiError } from "@/lib/errors";
import { createDocumentSchema, parseJson } from "@/lib/validation";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await listDocuments(user.id));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { title } = await parseJson(request, createDocumentSchema, { allowEmpty: true });

    // Content falls back to the column default (an empty TipTap doc).
    const [row] = await getDb()
      .insert(schema.documents)
      .values({ ownerId: user.id, ...(title !== undefined ? { title } : {}) })
      .returning();

    const document = serializeDocument(
      {
        id: row.id,
        title: row.title,
        ownerId: row.ownerId,
        owner: { id: user.id, name: user.name },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.content,
    );
    return Response.json({ document, role: "owner" }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
