import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { ApiError, formatZodError, handleApiError } from "@/lib/errors";
import {
  MAX_CONTENT_BYTES,
  MAX_TITLE_LENGTH,
  createDocumentSchema,
  idSchema,
  loginSchema,
  parseId,
  parseJson,
  shareSchema,
  tiptapDocSchema,
  unshareSchema,
  updateDocumentSchema,
} from "@/lib/validation";

const VALID_ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const DOC = { type: "doc", content: [{ type: "paragraph" }] };

function jsonRequest(body: string) {
  return new Request("http://localhost/api/x", { method: "POST", body });
}

/** A valid doc whose serialized size is just over (or at) `bytes`. */
function docOfSize(bytes: number) {
  const overhead = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
  }).length;
  const text = "a".repeat(bytes - overhead);
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

describe("title (via createDocumentSchema)", () => {
  it("is optional", () => {
    expect(createDocumentSchema.parse({})).toEqual({});
  });

  it("is trimmed", () => {
    expect(createDocumentSchema.parse({ title: "  Hello  " })).toEqual({ title: "Hello" });
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   \n\t "],
  ])("rejects %s", (_n, title) => {
    expect(createDocumentSchema.safeParse({ title }).success).toBe(false);
  });

  it("accepts exactly the max length and rejects one more", () => {
    expect(createDocumentSchema.safeParse({ title: "a".repeat(MAX_TITLE_LENGTH) }).success).toBe(true);
    expect(createDocumentSchema.safeParse({ title: "a".repeat(MAX_TITLE_LENGTH + 1) }).success).toBe(false);
  });

  it("measures length after trimming", () => {
    const padded = ` ${"a".repeat(MAX_TITLE_LENGTH)} `;
    expect(createDocumentSchema.parse({ title: padded }).title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it.each([123, null, true, ["x"], { a: 1 }])("rejects non-string title %j", (title) => {
    expect(createDocumentSchema.safeParse({ title }).success).toBe(false);
  });
});

describe("tiptapDocSchema", () => {
  it("accepts a minimal doc and keeps unknown keys on nodes", () => {
    const doc = {
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hi" }] }],
    };
    expect(tiptapDocSchema.parse(doc)).toEqual(doc);
  });

  it.each<[string, unknown]>([
    ["wrong root type", { type: "paragraph", content: [{ type: "paragraph" }] }],
    ["missing type", { content: [{ type: "paragraph" }] }],
    ["missing content", { type: "doc" }],
    ["empty content", { type: "doc", content: [] }],
    ["content not an array", { type: "doc", content: "text" }],
    ["node without type", { type: "doc", content: [{ text: "x" }] }],
    ["node with non-string type", { type: "doc", content: [{ type: 1 }] }],
    ["string", "doc"],
    ["null", null],
    ["array", [DOC]],
  ])("rejects %s", (_n, value) => {
    expect(tiptapDocSchema.safeParse(value).success).toBe(false);
  });

  it("accepts content at the size limit and rejects it one byte over", () => {
    const atLimit = docOfSize(MAX_CONTENT_BYTES);
    expect(new TextEncoder().encode(JSON.stringify(atLimit)).length).toBe(MAX_CONTENT_BYTES);
    expect(tiptapDocSchema.safeParse(atLimit).success).toBe(true);

    const over = docOfSize(MAX_CONTENT_BYTES + 1);
    const result = tiptapDocSchema.safeParse(over);
    expect(result.success).toBe(false);
    expect(result.error && formatZodError(result.error)).toMatch(/too large/);
  });

  it("measures bytes, not characters (multi-byte text counts more)", () => {
    const chars = Math.floor(MAX_CONTENT_BYTES / 3); // 3 bytes each in UTF-8
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "€".repeat(chars) }] }] };
    expect(JSON.stringify(doc).length).toBeLessThan(MAX_CONTENT_BYTES);
    expect(tiptapDocSchema.safeParse(doc).success).toBe(false);
  });
});

describe("updateDocumentSchema", () => {
  it("accepts title only, content only, or both", () => {
    expect(updateDocumentSchema.safeParse({ title: "New" }).success).toBe(true);
    expect(updateDocumentSchema.safeParse({ content: DOC }).success).toBe(true);
    expect(updateDocumentSchema.safeParse({ title: "New", content: DOC }).success).toBe(true);
  });

  it("requires at least one field", () => {
    const result = updateDocumentSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error && formatZodError(result.error)).toMatch(/title and\/or content/);
  });

  it("rejects an invalid title or content even if the other field is valid", () => {
    expect(updateDocumentSchema.safeParse({ title: "   ", content: DOC }).success).toBe(false);
    expect(updateDocumentSchema.safeParse({ title: "ok", content: { type: "x" } }).success).toBe(false);
  });
});

describe("shareSchema", () => {
  it.each(["viewer", "editor"] as const)("accepts permission %s", (permission) => {
    expect(shareSchema.parse({ email: "bob@example.com", permission })).toEqual({
      email: "bob@example.com",
      permission,
    });
  });

  it("trims and lower-cases the email", () => {
    expect(shareSchema.parse({ email: "  Bob@Example.COM ", permission: "viewer" }).email).toBe("bob@example.com");
  });

  it.each(["owner", "admin", "EDITOR", "", null, 1])("rejects permission %j", (permission) => {
    expect(shareSchema.safeParse({ email: "bob@example.com", permission }).success).toBe(false);
  });

  it.each(["", "bob", "bob@", "@example.com", "a b@example.com", 5, null])(
    "rejects email %j",
    (email) => {
      expect(shareSchema.safeParse({ email, permission: "viewer" }).success).toBe(false);
    },
  );

  it("requires both fields", () => {
    expect(shareSchema.safeParse({ email: "bob@example.com" }).success).toBe(false);
    expect(shareSchema.safeParse({ permission: "viewer" }).success).toBe(false);
  });
});

describe("loginSchema / unshareSchema", () => {
  it("normalises the login email", () => {
    expect(loginSchema.parse({ email: " Alice@Example.com " })).toEqual({ email: "alice@example.com" });
  });

  it("rejects a missing or malformed login email", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("unshare requires a UUID userId", () => {
    expect(unshareSchema.safeParse({ userId: VALID_ID }).success).toBe(true);
    expect(unshareSchema.safeParse({ userId: "123" }).success).toBe(false);
    expect(unshareSchema.safeParse({}).success).toBe(false);
  });
});

describe("id params", () => {
  it("accepts a UUID", () => {
    expect(parseId(VALID_ID)).toBe(VALID_ID);
    expect(idSchema.safeParse(VALID_ID.toUpperCase()).success).toBe(true);
  });

  it.each(["", "abc", "123", "not-a-uuid", `${VALID_ID}x`, `${VALID_ID}\n`, "../etc/passwd", "1; drop table users"])(
    "rejects %j",
    (raw) => {
      expect(() => parseId(raw)).toThrow(ZodError);
    },
  );
});

describe("parseJson", () => {
  it("parses a valid body", async () => {
    await expect(parseJson(jsonRequest('{"title":" Hi "}'), createDocumentSchema)).resolves.toEqual({ title: "Hi" });
  });

  it("turns malformed JSON into a 400 ApiError", async () => {
    const err = await parseJson(jsonRequest("{nope"), createDocumentSchema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
  });

  it("rejects an empty body unless allowEmpty is set", async () => {
    await expect(parseJson(jsonRequest(""), createDocumentSchema)).rejects.toMatchObject({ status: 400 });
    await expect(parseJson(jsonRequest(""), createDocumentSchema, { allowEmpty: true })).resolves.toEqual({});
  });

  it("rejects an oversized body before parsing it", async () => {
    const huge = JSON.stringify({ title: "a".repeat(MAX_CONTENT_BYTES + 32 * 1024) });
    await expect(parseJson(jsonRequest(huge), createDocumentSchema)).rejects.toMatchObject({
      status: 400,
      code: "body_too_large",
    });
  });
});

describe("error responses", () => {
  it("handleApiError maps a ZodError to a readable 400", async () => {
    const result = createDocumentSchema.safeParse({ title: "" });
    const res = handleApiError(result.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toBe("title must not be empty");
  });

  it("prefixes the field path when the message does not name it", () => {
    const result = unshareSchema.safeParse({ userId: "nope" });
    expect(result.error && formatZodError(result.error)).toBe("userId: id must be a valid UUID");
  });

  it("does not repeat the field name when the message already has it", () => {
    const result = shareSchema.safeParse({ email: "bob@example.com" });
    expect(result.error && formatZodError(result.error)).toBe('permission must be "viewer" or "editor"');
  });

  it("handleApiError passes ApiError status/code through and hides unknown errors", async () => {
    const known = handleApiError(new ApiError(403, "forbidden", "No"));
    expect(known.status).toBe(403);
    expect((await known.json()).error).toEqual({ code: "forbidden", message: "No" });

    const unknown = handleApiError(new Error("db password leaked: hunter2"));
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(await unknown.json())).not.toContain("hunter2");
  });
});
