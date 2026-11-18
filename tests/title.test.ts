import { describe, expect, it } from "vitest";
import { MAX_TITLE_LENGTH, validateTitle } from "@/lib/title";
import { titleSchema } from "@/lib/validation";

describe("validateTitle", () => {
  it("trims the title", () => {
    expect(validateTitle("  Hello  ")).toEqual({ ok: true, value: "Hello" });
  });

  it.each(["", "   ", "\n\t "])("rejects empty / whitespace-only %j", (raw) => {
    expect(validateTitle(raw)).toMatchObject({ ok: false });
  });

  it("accepts exactly the maximum length and rejects one more", () => {
    expect(validateTitle("a".repeat(MAX_TITLE_LENGTH)).ok).toBe(true);
    const tooLong = validateTitle("a".repeat(MAX_TITLE_LENGTH + 1));
    expect(tooLong.ok).toBe(false);
    expect(!tooLong.ok && tooLong.message).toContain(String(MAX_TITLE_LENGTH));
  });

  it("measures length after trimming", () => {
    expect(validateTitle(` ${"a".repeat(MAX_TITLE_LENGTH)} `).ok).toBe(true);
  });

  it("agrees with the server-side schema on every case", () => {
    for (const raw of ["", "  ", "ok", " ok ", "a".repeat(200), "a".repeat(201), " ".repeat(5) + "a".repeat(200)]) {
      expect(validateTitle(raw).ok).toBe(titleSchema.safeParse(raw).success);
    }
  });
});
