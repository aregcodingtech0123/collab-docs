// POST /api/auth/login { email }: sign in as an existing (seeded) user by setting the mock session cookie.

import { findUserByEmail, setSessionCookie } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/errors";
import { loginSchema, parseJson } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const { email } = await parseJson(request, loginSchema);
    const user = await findUserByEmail(email);
    if (!user) throw new ApiError(404, "user_not_found", "No user with that email");
    await setSessionCookie(user.id);
    return Response.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
