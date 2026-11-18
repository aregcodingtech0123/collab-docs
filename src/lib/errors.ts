// ApiError + helpers for returning consistent JSON errors from route handlers.
// Body shape: { error: { code, message } }  (see ApiErrorBody in @/types)

import { ZodError } from "zod";
import type { ApiErrorBody } from "@/types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}

/** Convert anything thrown inside a route handler into a JSON error response. */
export function handleApiError(err: unknown): Response {
  if (err instanceof ApiError) {
    return errorResponse(err.status, err.code, err.message);
  }
  if (err instanceof ZodError) {
    return errorResponse(400, "invalid_request", err.issues[0]?.message ?? "Invalid request");
  }
  console.error(err);
  return errorResponse(500, "internal_error", "Something went wrong");
}

/** Placeholder response used by route stubs until handlers are implemented. */
export function notImplemented(): Response {
  return errorResponse(501, "not_implemented", "Not implemented yet");
}
