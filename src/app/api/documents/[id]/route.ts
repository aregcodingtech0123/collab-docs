// GET (full document + caller's role) / PATCH (title, content) / DELETE (owner only).
// Access rules live in lib/documents.ts (requireDocumentAccess).

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { loadContent, requireDocumentAccess, serializeDocument } from "@/lib/documents";
import { ApiError, handleApiError } from "@/lib/errors";
import { parseId, parseJson, updateDocumentSchema } from "@/lib/validation";
import type { TipTapDoc } from "@/types";

export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  try {
    const user = await requireUser();
    const id = parseId((await ctx.params).id);
    const { document, role } = await requireDocumentAccess(id, user.id, "view");
    const content = await loadContent(id);
    return Response.json({ document: serializeDocument(document, content), role });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  try {
    const user = await requireUser();
    const id = parseId((await ctx.params).id);
    // Check access before reading a (possibly large) body.
    const { role } = await requireDocumentAccess(id, user.id, "edit");
    const { title, content } = await parseJson(request, updateDocumentSchema);

    const [updated] = await getDb()
      .update(schema.documents)
      .set({
        ...(title !== undefined ? { title } : {}),
        // tiptapDocSchema checks the structure; node attrs are left to TipTap.
        ...(content !== undefined ? { content: content as unknown as TipTapDoc } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.documents.id, id))
      .returning({
        id: schema.documents.id,
        title: schema.documents.title,
        updatedAt: schema.documents.updatedAt,
      });
    if (!updated) throw new ApiError(404, "not_found", "Document not found");

    return Response.json({ document: updated, role });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  try {
    const user = await requireUser();
    const id = parseId((await ctx.params).id);
    await requireDocumentAccess(id, user.id, "delete");
    // Shares are removed by ON DELETE CASCADE.
    await getDb().delete(schema.documents).where(eq(schema.documents.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
