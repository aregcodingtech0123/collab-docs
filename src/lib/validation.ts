// zod schemas for API request bodies.
// TODO: refine as handlers are implemented (title length limits, content size cap, ...).

import { z } from "zod";
import { SHARE_PERMISSIONS } from "@/types";

export const loginSchema = z.object({ userId: z.uuid() });

/** Loose structural check only; TipTap validates the schema when loading. */
export const tiptapDocSchema = z.looseObject({
  type: z.literal("doc"),
  content: z.array(z.unknown()).optional(),
});

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: tiptapDocSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: "Provide a title and/or content",
  });

export const shareSchema = z.object({
  userId: z.uuid(),
  permission: z.enum(SHARE_PERMISSIONS),
});

export const unshareSchema = z.object({ userId: z.uuid() });
