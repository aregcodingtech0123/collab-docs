// Home: redirects to /documents when a user cookie is present, otherwise /login.
//
// This only checks that the cookie exists. Pages that need a user validate it
// (getCurrentUser) and redirect to /login themselves if it is stale/unknown.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USER_COOKIE } from "@/lib/auth";

export default async function HomePage() {
  const cookieStore = await cookies();
  redirect(cookieStore.has(USER_COOKIE) ? "/documents" : "/login");
}
