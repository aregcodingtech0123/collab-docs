import { describe, expect, it } from "vitest";
import {
  candidateUsers,
  describeShareError,
  isPlausibleEmail,
  removeShare,
  sortShares,
  upsertShare,
  type ShareEntry,
} from "@/lib/shares";
import type { User } from "@/types";

const user = (id: string, name: string, email = `${name.toLowerCase()}@example.com`): User => ({ id, name, email });
const alice = user("a", "Alice");
const bob = user("b", "Bob");
const carol = user("c", "Carol");
const dave = user("d", "Dave");

describe("candidateUsers", () => {
  it("excludes the owner and people already shared with", () => {
    const shares: ShareEntry[] = [{ user: bob, permission: "viewer" }];
    expect(candidateUsers([alice, bob, carol, dave], "a", shares).map((u) => u.name)).toEqual(["Carol", "Dave"]);
  });

  it("never offers the owner, even when nobody is shared yet", () => {
    expect(candidateUsers([alice, bob], "a", []).map((u) => u.id)).toEqual(["b"]);
  });

  it("is empty when everyone has access", () => {
    expect(candidateUsers([alice, bob], "a", [{ user: bob, permission: "editor" }])).toEqual([]);
  });

  it("sorts by name and does not mutate its input", () => {
    const input = [dave, carol, bob];
    expect(candidateUsers(input, "x", []).map((u) => u.name)).toEqual(["Bob", "Carol", "Dave"]);
    expect(input.map((u) => u.name)).toEqual(["Dave", "Carol", "Bob"]);
  });
});

describe("share list updates", () => {
  it("adds a new share in name order", () => {
    const list = upsertShare([{ user: dave, permission: "viewer" }], { user: bob, permission: "editor" });
    expect(list.map((s) => s.user.name)).toEqual(["Bob", "Dave"]);
  });

  it("replaces the permission of an existing share instead of duplicating it", () => {
    const list = upsertShare([{ user: bob, permission: "viewer" }], { user: bob, permission: "editor" });
    expect(list).toEqual([{ user: bob, permission: "editor" }]);
  });

  it("removes a share by user id and leaves the others", () => {
    const list = removeShare(
      [
        { user: bob, permission: "viewer" },
        { user: carol, permission: "editor" },
      ],
      "b",
    );
    expect(list.map((s) => s.user.id)).toEqual(["c"]);
  });

  it("removing an unknown user is a no-op", () => {
    const list: ShareEntry[] = [{ user: bob, permission: "viewer" }];
    expect(removeShare(list, "zzz")).toEqual(list);
  });

  it("sortShares does not mutate", () => {
    const list: ShareEntry[] = [
      { user: carol, permission: "viewer" },
      { user: bob, permission: "viewer" },
    ];
    expect(sortShares(list).map((s) => s.user.name)).toEqual(["Bob", "Carol"]);
    expect(list[0].user.name).toBe("Carol");
  });
});

describe("isPlausibleEmail", () => {
  it.each(["a@b.co", " bob@example.com ", "first.last+tag@sub.example.org"])("accepts %j", (v) => {
    expect(isPlausibleEmail(v)).toBe(true);
  });

  it.each(["", "bob", "bob@", "@example.com", "bob@example", "a b@example.com", "bob@@example.com"])(
    "rejects %j",
    (v) => {
      expect(isPlausibleEmail(v)).toBe(false);
    },
  );
});

describe("describeShareError", () => {
  it("explains an unknown email", () => {
    expect(describeShareError(404, "user_not_found")).toMatch(/No one with that email/);
  });

  it("explains sharing with yourself / the owner", () => {
    expect(describeShareError(400, "invalid_share")).toMatch(/already own/);
  });

  it("explains a malformed email and permission", () => {
    expect(describeShareError(400, "invalid_request", "email must be a valid email address")).toBe(
      "Enter a valid email address.",
    );
    expect(describeShareError(400, "invalid_request", 'permission must be "viewer" or "editor"')).toMatch(/Viewer or Editor/);
  });

  it("explains 401, 403 and a vanished document", () => {
    expect(describeShareError(401)).toMatch(/session has ended/);
    expect(describeShareError(403)).toMatch(/Only the owner/);
    expect(describeShareError(404, "not_found")).toMatch(/no longer available/);
    expect(describeShareError(404, "share_not_found")).toMatch(/no longer has access/);
  });

  it.each([500, 502, 418, 0])("never exposes raw details for status %i", (status) => {
    expect(describeShareError(status, "internal_error", "TypeError: boom at x.ts:1")).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
