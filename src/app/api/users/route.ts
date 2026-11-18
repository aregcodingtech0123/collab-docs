// GET /api/users: all users (id, name, email), for the share dialog. Auth required.

import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function GET() {
  try {
    await requireUser();
    const users = await getDb()
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .orderBy(asc(schema.users.name), asc(schema.users.email));
    return Response.json({ users });
  } catch (err) {
    return handleApiError(err);
  }
}
