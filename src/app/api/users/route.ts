// GET /api/users: all users (id, name, email), for the share dialog. Auth required.

import { listUsers, requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ users: await listUsers() });
  } catch (err) {
    return handleApiError(err);
  }
}
