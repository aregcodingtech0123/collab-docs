// Owner-only share management: GET list / POST add-or-update / DELETE remove.
// Access rules live in lib/documents.ts (requireDocumentAccess(..., "share")).

import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { findUserByEmail, requireUser } from "@/lib/auth";
import { requireDocumentAccess } from "@/lib/documents";
import { ApiError, handleApiError } from "@/lib/errors";
import { parseId, parseJson, shareSchema, unshareSchema } from "@/lib/validation";

const { documentShares, users } = schema;

export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/shares">) {
  try {
    const user = await requireUser();
    const id = parseId((await ctx.params).id);
    await requireDocumentAccess(id, user.id, "share");

    const rows = await getDb()
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        permission: documentShares.permission,
      })
      .from(documentShares)
      .innerJoin(users, eq(users.id, documentShares.userId))
      .where(eq(documentShares.documentId, id))
      .orderBy(asc(users.name), asc(users.email));

    return Response.json({
      shares: rows.map((r) => ({
        user: { id: r.userId, name: r.name, email: r.email },
        permission: r.permission,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/documents/[id]/shares">) {
  try {
    const user = await requireUser();
    const id = parseId((await ctx.params).id);
    const { document } = await requireDocumentAccess(id, user.id, "share");
    const { email, permission } = await parseJson(request, shareSchema);

    const target = await findUserByEmail(email);
    if (!target) throw new ApiError(404, "user_not_found", "No user with that email");
    // Only the owner can get here, so "yourself" and "the owner" are the same person.
    if (target.id === document.ownerId || target.id === user.id) {
      throw new ApiError(400, "invalid_share", "You already own this document");
    }

    // Single upsert: re-sharing with the same user updates the permission.
    // (neon-http has no interactive transactions, so no select-then-insert.)
    const [share] = await getDb()
      .insert(documentShares)
      .values({ documentId: id, userId: target.id, permission })
      .onConflictDoUpdate({
        target: [documentShares.documentId, documentShares.userId],
        set: { permission },
      })
      .returning({ permission: documentShares.permission });

    return Response.json({ share: { user: target, permission: share.permission } });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/documents/[id]/shares">) {
  try {
    const user = await requireUser();
    const id = parseId((await ctx.params).id);
    await requireDocumentAccess(id, user.id, "share");
    const { userId } = await parseJson(request, unshareSchema);

    const removed = await getDb()
      .delete(documentShares)
      .where(and(eq(documentShares.documentId, id), eq(documentShares.userId, userId)))
      .returning({ id: documentShares.id });
    if (removed.length === 0) {
      throw new ApiError(404, "share_not_found", "That user does not have a share on this document");
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
