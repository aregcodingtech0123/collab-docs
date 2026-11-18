// POST /api/auth/logout: clear the session cookie (always succeeds).

import { clearSessionCookie } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function POST() {
  try {
    await clearSessionCookie();
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
