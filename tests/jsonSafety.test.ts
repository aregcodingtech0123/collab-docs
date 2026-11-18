import { describe, expect, it } from "vitest";
import { MAX_CONTENT_DEPTH, inspectJson, isUnstorableText } from "@/lib/jsonSafety";
import { tiptapDocSchema, titleSchema, updateDocumentSchema } from "@/lib/validation";

const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const doc = (...content: unknown[]) => ({ type: "doc", content });
function nested(levels: number) {
  let node: unknown = para("x");
  for (let i = 0; i < levels; i++) node = { type: "bulletList", content: [node] };
  return node;
}

describe("isUnstorableText", () => {
  it.each(["a\u0000b", "\u0000", "x\ud800y", "\ud800", "\udc00", "ends with high\ud83d"])("flags %j", (s) => {
    expect(isUnstorableText(s)).toBe(true);
  });

  it.each(["", "plain", "ünïcödé 日本語", "emoji 🎉 pair", "😀", "tab\tand\nnewline"])("accepts %j", (s) => {
    expect(isUnstorableText(s)).toBe(false);
  });
});

describe("inspectJson", () => {
  it("passes ordinary documents", () => {
    expect(inspectJson(doc(para("hi"), para("there")))).toEqual({ unstorableText: false, tooDeep: false });
  });

  it("finds bad text in values and in object keys, at any depth", () => {
    expect(inspectJson(doc(para("a\u0000b"))).unstorableText).toBe(true);
    expect(inspectJson(doc({ type: "p", attrs: { ["k\u0000"]: 1 } })).unstorableText).toBe(true);
    expect(inspectJson({ a: [{ b: [{ c: "x\ud800" }] }] }).unstorableText).toBe(true);
  });

  it("limits nesting without overflowing the stack, however deep the input is", () => {
    expect(inspectJson(nested(5), MAX_CONTENT_DEPTH).tooDeep).toBe(false);
    expect(inspectJson(nested(200)).tooDeep).toBe(true);
    // 5,000 levels: an iterative walk, so no RangeError
    expect(inspectJson(nested(5000)).tooDeep).toBe(true);
  });

  it("allows a realistic number of nested list levels", () => {
    // each list level adds bulletList + content[] + listItem + content[] = 4 levels
    expect(inspectJson(doc(nested(10))).tooDeep).toBe(false);
  });
});

describe("validation uses it", () => {
  it.each([
    ["NUL in the title", "a\u0000b"],
    ["a lone surrogate in the title", "x\ud800y"],
  ])("titleSchema rejects %s", (_n, title) => {
    const result = titleSchema.safeParse(title);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/cannot be used/);
  });

  it("titleSchema still accepts emoji and non-Latin text", () => {
    expect(titleSchema.parse("日本語 🎉 plan")).toBe("日本語 🎉 plan");
  });

  it.each([
    ["NUL in text", doc(para("a\u0000b"))],
    ["a lone surrogate", doc(para("x\ud800"))],
    ["NUL in a key", doc({ type: "paragraph", attrs: { "a\u0000": 1 } })],
  ])("tiptapDocSchema rejects %s with a readable message", (_n, value) => {
    const result = tiptapDocSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("content contains characters that cannot be stored");
  });

  it("tiptapDocSchema rejects absurd nesting (300 and 5,000 levels)", () => {
    for (const levels of [300, 5000]) {
      const result = tiptapDocSchema.safeParse(doc(nested(levels)));
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toMatch(/nested too deeply/);
    }
  });

  it("updateDocumentSchema applies both rules", () => {
    expect(updateDocumentSchema.safeParse({ title: "a\u0000" }).success).toBe(false);
    expect(updateDocumentSchema.safeParse({ content: doc(para("a\u0000")) }).success).toBe(false);
    expect(updateDocumentSchema.safeParse({ title: "fine", content: doc(para("fine")) }).success).toBe(true);
  });
});
