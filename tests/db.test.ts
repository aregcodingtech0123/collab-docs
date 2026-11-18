import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, handleApiError } from "@/lib/errors";

// The database client must be lazy (so `next build` and tests never need a database) and a
// missing DATABASE_URL must produce a clear message for the operator without ever reaching a client.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("getDb without DATABASE_URL", () => {
  it("importing the module does not need (or touch) a database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("@/db")).resolves.toBeDefined();
  });

  it.each([undefined, ""])("throws a clear, actionable error when it is %j", async (value) => {
    vi.stubEnv("DATABASE_URL", value as string);
    if (value === undefined) delete process.env.DATABASE_URL;
    const { getDb } = await import("@/db");
    expect(() => getDb()).toThrow(/DATABASE_URL is not set/);
    expect(() => getDb()).toThrow(/\.env\.local/); // what to do locally
    expect(() => getDb()).toThrow(/Vercel/); // and on Vercel
  });

  it("a route handler turns that error into a generic 500 that reveals nothing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined); // the operator log line
    const { getDb } = await import("@/db");
    let thrown: unknown;
    try {
      getDb();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(ApiError);

    const res = handleApiError(thrown);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/DATABASE_URL|env|Vercel|neon|postgres/i);
    expect(JSON.parse(text)).toEqual({ error: { code: "internal_error", message: "Something went wrong" } });
    expect(console.error).toHaveBeenCalled(); // the real cause is logged server-side
  });

  it("the secret value itself never appears in the error", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getDb } = await import("@/db");
    expect(() => getDb()).not.toThrow(/postgres(ql)?:\/\//);
  });
});
