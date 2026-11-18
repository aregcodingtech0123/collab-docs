// MOCK AUTH: intentionally simple and NOT secure.
//
// The "session" is an httpOnly cookie that holds a plain user id. There is no
// password, no signature and no server-side session, so anyone who knows (or
// guesses) a user's id can set that cookie and act as them. That is a deliberate
// cut for this exercise (see "Deliberate cuts" in ARCHITECTURE.md): the point is
// to demonstrate per-user ownership and sharing, not to build identity.
//
// What we do still guarantee: the user is looked up in the DB on every request,
// so a cookie for a user that does not exist (or was deleted) is simply "signed out".

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import { ApiError } from "@/lib/errors";
import { idSchema } from "@/lib/validation";
import type { User } from "@/types";

/** Cookie that holds the id of the "logged in" seeded user. */
export const USER_COOKIE = "collab_user_id";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await getDb()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return user ?? null;
}

/** The signed-in user, or null if the cookie is missing, malformed or points at no user. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const raw = store.get(USER_COOKIE)?.value;
  if (!raw) return null;

  // A tampered cookie must not reach the DB as an invalid uuid (that would be a 500).
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return null;

  const [user] = await getDb()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, parsed.data))
    .limit(1);
  return user ?? null;
}

/** Like getCurrentUser(), but throws ApiError 401 when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "unauthorized", "You need to sign in first");
  return user;
}

/** Route handlers only (cookies cannot be written while rendering). */
export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
}
