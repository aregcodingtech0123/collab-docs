// Home: redirects to /documents when signed in, otherwise /login.
// TODO: check the user cookie (behind <Suspense>, see lib/auth.ts) and redirect accordingly.

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/login");
}
