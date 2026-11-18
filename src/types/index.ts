// Shared domain types. Keep this file dependency-free so it can be imported
// from the DB schema, server code, client components and tests alike.

/** Permissions that can be *granted* via a share. The owner is implicit. */
export const SHARE_PERMISSIONS = ["viewer", "editor"] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

/** Effective role of a user on a document ("none" = no access). */
export type Role = "owner" | SharePermission | "none";

export interface User {
  id: string;
  name: string;
  email: string;
}

/** TipTap / ProseMirror JSON document. */
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface TipTapDoc extends TipTapNode {
  type: "doc";
}

export interface DocumentSummary {
  id: string;
  title: string;
  ownerId: string;
  updatedAt: string;
  /** The current user's role on this document. */
  role: Exclude<Role, "none">;
}

export interface DocumentShare {
  userId: string;
  permission: SharePermission;
}

export type SaveState = "saved" | "saving" | "error";

/** Shape of every JSON error returned by the API. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
