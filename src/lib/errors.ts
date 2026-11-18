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

/** First issue as a readable message, prefixed with the field path when there is one. */
export function formatZodError(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request";
  const path = issue.path.join(".");
  // Our schema messages already name the field ("title must not be empty").
  const named = path !== "" && !issue.message.startsWith(path);
  return named ? `${path}: ${issue.message}` : issue.message;
}

/** Convert anything thrown inside a route handler into a JSON error response. */
export function handleApiError(err: unknown): Response {
  if (err instanceof ApiError) {
    return errorResponse(err.status, err.code, err.message);
  }
  if (err instanceof ZodError) {
    return errorResponse(400, "invalid_request", formatZodError(err));
  }
  console.error(err);
  return errorResponse(500, "internal_error", "Something went wrong");
}

/** Placeholder response used by route stubs until handlers are implemented. */
export function notImplemented(): Response {
  return errorResponse(501, "not_implemented", "Not implemented yet");
}
