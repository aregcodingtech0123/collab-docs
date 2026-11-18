import { describe, it } from "vitest";

// Subject: src/lib/permissions.ts (pure functions; no DB needed).

describe("getRole", () => {
  it.todo("returns 'none' when userId is null, undefined or empty");
  it.todo("returns 'owner' when userId matches ownerId");
  it.todo("returns 'owner' even if the owner also has a share row");
  it.todo("returns 'editor' / 'viewer' from the acting user's share");
  it.todo("ignores shares that belong to other users");
  it.todo("returns 'none' for a user with no share who is not the owner");
  it.todo("prefers the most permissive share if duplicates are passed");
});

describe("canView", () => {
  it.todo("allows owner, editor and viewer");
  it.todo("denies users with no access and signed-out users");
});

describe("canEdit", () => {
  it.todo("allows owner and editor");
  it.todo("denies viewer, no-access and signed-out users");
});

describe("canShare / canDelete", () => {
  it.todo("allows owner only");
  it.todo("denies editor, viewer and no-access users");
});
