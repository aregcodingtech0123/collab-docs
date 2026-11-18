// zod schemas + request parsing helpers for the API.

import { z } from "zod";
import { SHARE_PERMISSIONS } from "@/types";
import { ApiError } from "@/lib/errors";

export const MAX_TITLE_LENGTH = 200;
/** Max serialized size of a document's content (bytes of its JSON). */
export const MAX_CONTENT_BYTES = 1024 * 1024;
/** Hard cap on any request body we are willing to read (content + envelope). */
const MAX_BODY_BYTES = MAX_CONTENT_BYTES + 16 * 1024;

export const titleSchema = z
  .string("title must be a string")
  .trim()
  .min(1, "title must not be empty")
  .max(MAX_TITLE_LENGTH, `title must be at most ${MAX_TITLE_LENGTH} characters`);

export const emailSchema = z
  .string("email must be a string")
  .trim()
  .toLowerCase()
  .pipe(z.email("email must be a valid email address").max(254));

/** A document / user id taken from a URL param or body. */
export const idSchema = z.uuid("id must be a valid UUID");

/**
 * Structural check for a TipTap document: { type: "doc", content: [ {type}, ... ] }
 * with at least one block, and <= MAX_CONTENT_BYTES once serialized. It does not
 * validate individual node attributes; TipTap does that when loading.
 */
export const tiptapDocSchema = z
  .looseObject({
    type: z.literal("doc", "content.type must be \"doc\""),
    content: z
      .array(z.looseObject({ type: z.string("each content node needs a string type") }))
      .min(1, "content must contain at least one node"),
  })
  .refine((doc) => new TextEncoder().encode(JSON.stringify(doc)).length <= MAX_CONTENT_BYTES, {
    message: `content is too large (limit ${MAX_CONTENT_BYTES / 1024 / 1024} MB)`,
  });

export const loginSchema = z.object({ email: emailSchema });

export const createDocumentSchema = z.object({ title: titleSchema.optional() });

export const updateDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    content: tiptapDocSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: "provide a title and/or content to update",
  });

export const shareSchema = z.object({
  email: emailSchema,
  permission: z.enum(SHARE_PERMISSIONS, {
    error: 'permission must be "viewer" or "editor"',
  }),
});

export const unshareSchema = z.object({ userId: idSchema });

/** Validate a route param such as /documents/[id]. Throws ZodError -> 400. */
export function parseId(raw: string): string {
  return idSchema.parse(raw);
}

/**
 * Read and validate a JSON request body. Malformed JSON, an empty body (unless
 * allowEmpty), an oversized body or a schema mismatch all become 400s.
 */
export async function parseJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  options: { allowEmpty?: boolean } = {},
): Promise<z.output<S>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new ApiError(400, "body_too_large", "Request body is too large");
  }

  let raw: unknown;
  if (text.trim() === "") {
    if (!options.allowEmpty) {
      throw new ApiError(400, "invalid_json", "Request body is required");
    }
    raw = {};
  } else {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
    }
  }
  return schema.parse(raw);
}
