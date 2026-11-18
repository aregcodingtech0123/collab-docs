// Cookie-based "pick a user" auth (no passwords; seeded users only).
// TODO: implement getCurrentUser() by reading USER_COOKIE via next/headers
// cookies() and looking the user up in the DB. Return null if absent/unknown.

import type { User } from "@/types";

/** Cookie that holds the id of the "logged in" seeded user. */
export const USER_COOKIE = "collab_user_id";

export async function getCurrentUser(): Promise<User | null> {
  // TODO: implement
  throw new Error("getCurrentUser is not implemented yet");
}
