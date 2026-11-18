// Access-control rules. Pure functions only: no DB, no cookies, no I/O.
// Callers load the document's ownerId + its shares, then ask these functions.
//
//   owner  -> view, edit, share, delete
//   editor -> view, edit
//   viewer -> view
//   none   -> nothing

import type { DocumentShare, Role } from "@/types";

export interface AccessContext {
  /** The acting user. null/undefined/"" means "not signed in". */
  userId: string | null | undefined;
  /** documents.owner_id of the document being accessed. */
  ownerId: string;
  /** All shares on the document (only the acting user's entry matters). */
  shares: ReadonlyArray<DocumentShare>;
}

/** Resolve the acting user's effective role on a document. */
export function getRole({ userId, ownerId, shares }: AccessContext): Role {
  if (!userId) return "none";
  if (userId === ownerId) return "owner";

  let role: Role = "none";
  for (const share of shares) {
    if (share.userId !== userId) continue;
    // The DB enforces one share per (document, user), but stay safe if a caller
    // passes duplicates: the most permissive grant wins.
    if (share.permission === "editor") return "editor";
    role = "viewer";
  }
  return role;
}

export function roleCanView(role: Role): boolean {
  return role !== "none";
}

export function roleCanEdit(role: Role): boolean {
  return role === "owner" || role === "editor";
}

/** Sharing (and changing/revoking shares) is an owner-only action. */
export function roleCanShare(role: Role): boolean {
  return role === "owner";
}

/** Deleting a document is an owner-only action. */
export function roleCanDelete(role: Role): boolean {
  return role === "owner";
}

export function canView(ctx: AccessContext): boolean {
  return roleCanView(getRole(ctx));
}

export function canEdit(ctx: AccessContext): boolean {
  return roleCanEdit(getRole(ctx));
}

export function canShare(ctx: AccessContext): boolean {
  return roleCanShare(getRole(ctx));
}

export function canDelete(ctx: AccessContext): boolean {
  return roleCanDelete(getRole(ctx));
}
