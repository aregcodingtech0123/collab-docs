// Pure helpers for the share dialog (no React, no fetch), so they can be unit-tested.

import type { SharePermission, User } from "@/types";

export interface ShareEntry {
  user: User;
  permission: SharePermission;
}

export const PERMISSION_LABEL: Record<SharePermission, string> = {
  viewer: "Viewer",
  editor: "Editor",
};

export const PERMISSION_HELP = "Viewers can read the document. Editors can read and change it.";

const byName = (a: User, b: User) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.email.localeCompare(b.email);

export function sortShares(shares: ShareEntry[]): ShareEntry[] {
  return [...shares].sort((a, b) => byName(a.user, b.user));
}

/** Add a share, or replace the permission of the existing one for the same user. */
export function upsertShare(shares: ShareEntry[], entry: ShareEntry): ShareEntry[] {
  return sortShares([...shares.filter((s) => s.user.id !== entry.user.id), entry]);
}

export function removeShare(shares: ShareEntry[], userId: string): ShareEntry[] {
  return shares.filter((s) => s.user.id !== userId);
}

/** People the owner can still add: everyone except the owner and those already shared with. */
export function candidateUsers(users: User[], ownerId: string, shares: ShareEntry[]): User[] {
  const shared = new Set(shares.map((s) => s.user.id));
  return users.filter((u) => u.id !== ownerId && !shared.has(u.id)).sort(byName);
}

/** Loose sanity check; the server is the real validator. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Turn an API error into a sentence for the UI (never raw codes or stack traces). */
export function describeShareError(status: number, code?: string, message?: string): string {
  if (status === 401) return "Your session has ended. Please sign in again.";
  if (status === 403) return "Only the owner can change who this document is shared with.";
  if (status === 404) {
    if (code === "user_not_found") {
      return "No one with that email uses this app. Check the spelling or choose someone from the list.";
    }
    if (code === "share_not_found") return "That person no longer has access through a share.";
    return "This document is no longer available.";
  }
  if (status === 400) {
    if (code === "invalid_share") return "You already own this document, so there's nothing to share with yourself.";
    if (message && /email/i.test(message)) return "Enter a valid email address.";
    if (message && /permission/i.test(message)) return "Choose Viewer or Editor.";
  }
  return "Something went wrong. Please try again.";
}
