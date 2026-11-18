// Cookie-based "pick a user" auth (no passwords; seeded users only).
// TODO: implement getCurrentUser() by reading USER_COOKIE via next/headers
// cookies() and looking the user up in the DB. Return null if absent/unknown.
//
// Reminder: with Cache Components enabled, anything that reads cookies() must
// render behind a <Suspense> boundary.

import type { User } from "@/types";

export const USER_COOKIE = "collab_user_id";

export async function getCurrentUser(): Promise<User | null> {
  // TODO: implement
  throw new Error("getCurrentUser is not implemented yet");
}
