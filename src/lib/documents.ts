// The ONE code path for "load a document and work out what this user may do".
// Every document / share handler goes through requireDocumentAccess(), so the
// rules below cannot drift between endpoints.
//
// Security-critical detail: the share row is joined on BOTH document_id and
// user_id, so a share on another document (or for another user) can never
// feed lib/permissions.ts and grant access.

import { and, desc, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ApiError } from "@/lib/errors";
import {
  getRole,
  roleCanDelete,
  roleCanEdit,
  roleCanShare,
  roleCanView,
} from "@/lib/permissions";
import type { DocumentShare, Role, SharePermission, TipTapDoc } from "@/types";

const { documents, documentShares, users } = schema;

export type Access = "view" | "edit" | "share" | "delete";
export type GrantedRole = Exclude<Role, "none">;

export interface DocumentMeta {
  id: string;
  title: string;
  ownerId: string;
  owner: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentWithContent extends DocumentMeta {
  content: TipTapDoc;
}

const CHECKS: Record<Access, { allowed: (role: Role) => boolean; denied: string }> = {
  view: { allowed: roleCanView, denied: "You do not have access to this document" },
  edit: { allowed: roleCanEdit, denied: "You only have view access to this document" },
  share: { allowed: roleCanShare, denied: "Only the owner can manage sharing" },
  delete: { allowed: roleCanDelete, denied: "Only the owner can delete this document" },
};

/** Document metadata + the user's role, or null if the document does not exist. No content. */
export async function getDocumentAccess(
  documentId: string,
  userId: string,
): Promise<{ document: DocumentMeta; role: Role } | null> {
  const [row] = await getDb()
    .select({
      id: documents.id,
      title: documents.title,
      ownerId: documents.ownerId,
      ownerName: users.name,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      shareUserId: documentShares.userId,
      sharePermission: documentShares.permission,
    })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.ownerId))
    .leftJoin(
      documentShares,
      and(eq(documentShares.documentId, documents.id), eq(documentShares.userId, userId)),
    )
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!row) return null;

  const shares: DocumentShare[] =
    row.shareUserId && row.sharePermission
      ? [{ userId: row.shareUserId, permission: row.sharePermission }]
      : [];

  return {
    document: {
      id: row.id,
      title: row.title,
      ownerId: row.ownerId,
      owner: { id: row.ownerId, name: row.ownerName },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    role: getRole({ userId, ownerId: row.ownerId, shares }),
  };
}

/**
 * Load a document for `userId` and require the given access level.
 *   - missing document OR no access at all -> 404 (never leak that it exists)
 *   - can view, but lacks `need`           -> 403
 */
export async function requireDocumentAccess(
  documentId: string,
  userId: string,
  need: Access,
): Promise<{ document: DocumentMeta; role: GrantedRole }> {
  const found = await getDocumentAccess(documentId, userId);
  if (!found || found.role === "none") {
    throw new ApiError(404, "not_found", "Document not found");
  }
  if (!CHECKS[need].allowed(found.role)) {
    throw new ApiError(403, "forbidden", CHECKS[need].denied);
  }
  return { document: found.document, role: found.role };
}

/** Only call after requireDocumentAccess(..., "view"): reads the content column. */
export async function loadContent(documentId: string): Promise<TipTapDoc> {
  const [row] = await getDb()
    .select({ content: documents.content })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!row) throw new ApiError(404, "not_found", "Document not found");
  return row.content;
}

export function serializeDocument(doc: DocumentMeta, content?: TipTapDoc) {
  return {
    id: doc.id,
    title: doc.title,
    owner: doc.owner,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(content ? { content } : {}),
  };
}

export interface DocumentListItem {
  id: string;
  title: string;
  updatedAt: Date;
  owner: { id: string; name: string };
  role: GrantedRole;
}

/** Documents the user owns, and documents shared with them. Newest first, no content. */
export async function listDocuments(userId: string): Promise<{
  owned: DocumentListItem[];
  shared: DocumentListItem[];
}> {
  const db = getDb();

  const [ownedRows, sharedRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        title: documents.title,
        updatedAt: documents.updatedAt,
        ownerId: documents.ownerId,
        ownerName: users.name,
      })
      .from(documents)
      .innerJoin(users, eq(users.id, documents.ownerId))
      .where(eq(documents.ownerId, userId))
      .orderBy(desc(documents.updatedAt)),
    db
      .select({
        id: documents.id,
        title: documents.title,
        updatedAt: documents.updatedAt,
        ownerId: documents.ownerId,
        ownerName: users.name,
        permission: documentShares.permission,
      })
      .from(documentShares)
      .innerJoin(documents, eq(documents.id, documentShares.documentId))
      .innerJoin(users, eq(users.id, documents.ownerId))
      // ne(): a (hand-made) share row on your own document must not list it twice.
      .where(and(eq(documentShares.userId, userId), ne(documents.ownerId, userId)))
      .orderBy(desc(documents.updatedAt)),
  ]);

  return {
    owned: ownedRows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt,
      owner: { id: r.ownerId, name: r.ownerName },
      role: "owner" as const,
    })),
    shared: sharedRows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt,
      owner: { id: r.ownerId, name: r.ownerName },
      role: r.permission satisfies SharePermission,
    })),
  };
}
