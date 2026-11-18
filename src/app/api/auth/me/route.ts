// GET /api/auth/me: the current user, or 401.

import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
