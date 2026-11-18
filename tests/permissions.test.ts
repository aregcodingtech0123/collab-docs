import { describe, expect, it } from "vitest";
import {
  canDelete,
  canEdit,
  canShare,
  canView,
  getRole,
  roleCanDelete,
  roleCanEdit,
  roleCanShare,
  roleCanView,
  type AccessContext,
} from "@/lib/permissions";
import type { DocumentShare, Role } from "@/types";

// Subject: src/lib/permissions.ts (pure functions; no DB needed).

const OWNER = "user-owner";
const EDITOR = "user-editor";
const VIEWER = "user-viewer";
const STRANGER = "user-stranger";

/** The shares of ONE document, as a caller would load them from document_shares. */
const SHARES: DocumentShare[] = [
  { userId: EDITOR, permission: "editor" },
  { userId: VIEWER, permission: "viewer" },
];

function ctx(
  userId: AccessContext["userId"],
  shares: ReadonlyArray<DocumentShare> = SHARES,
  ownerId: string = OWNER,
): AccessContext {
  return { userId, ownerId, shares };
}

interface Expected {
  role: Role;
  view: boolean;
  edit: boolean;
  share: boolean;
  delete: boolean;
}

const FULL: Expected = { role: "owner", view: true, edit: true, share: true, delete: true };
const EDIT_ONLY: Expected = { role: "editor", view: true, edit: true, share: false, delete: false };
const VIEW_ONLY: Expected = { role: "viewer", view: true, edit: false, share: false, delete: false };
const NOTHING: Expected = { role: "none", view: false, edit: false, share: false, delete: false };

function check(c: AccessContext, expected: Expected) {
  expect(getRole(c)).toBe(expected.role);
  expect(canView(c)).toBe(expected.view);
  expect(canEdit(c)).toBe(expected.edit);
  expect(canShare(c)).toBe(expected.share);
  expect(canDelete(c)).toBe(expected.delete);
}

describe("access matrix", () => {
  it.each<[string, AccessContext, Expected]>([
    ["owner", ctx(OWNER), FULL],
    ["editor share", ctx(EDITOR), EDIT_ONLY],
    ["viewer share", ctx(VIEWER), VIEW_ONLY],
    ["stranger (no share)", ctx(STRANGER), NOTHING],
    ["signed out (null)", ctx(null), NOTHING],
    ["signed out (undefined)", ctx(undefined), NOTHING],
    ["signed out (empty string)", ctx(""), NOTHING],
  ])("%s", (_name, c, expected) => {
    check(c, expected);
  });
});

describe("owner", () => {
  it("has full access even with no shares at all", () => {
    check(ctx(OWNER, []), FULL);
  });

  it.each<DocumentShare["permission"]>(["viewer", "editor"])(
    "keeps full access when they also appear in the shares list as %s",
    (permission) => {
      const shares: DocumentShare[] = [...SHARES, { userId: OWNER, permission }];
      check(ctx(OWNER, shares), FULL);
    },
  );
});

describe("matching shares by userId", () => {
  it("gives a stranger nothing when the shares list is empty", () => {
    check(ctx(STRANGER, []), NOTHING);
  });

  it("gives a shared user nothing once their share is absent", () => {
    check(ctx(EDITOR, []), NOTHING);
  });

  it("picks the acting user's own row among many", () => {
    const shares: DocumentShare[] = [
      { userId: "a", permission: "editor" },
      { userId: VIEWER, permission: "viewer" },
      { userId: "b", permission: "editor" },
      { userId: EDITOR, permission: "editor" },
      { userId: "c", permission: "viewer" },
    ];
    check(ctx(VIEWER, shares), VIEW_ONLY);
    check(ctx(EDITOR, shares), EDIT_ONLY);
    check(ctx(STRANGER, shares), NOTHING);
  });

  it("does not let someone else's editor share grant access to a viewer", () => {
    const shares: DocumentShare[] = [
      { userId: EDITOR, permission: "editor" },
      { userId: VIEWER, permission: "viewer" },
    ];
    expect(canEdit(ctx(VIEWER, shares))).toBe(false);
  });

  it("does not match user ids loosely (prefix, case, whitespace)", () => {
    const shares: DocumentShare[] = [{ userId: "user-editor", permission: "editor" }];
    for (const id of ["user-edit", "user-editor2", "USER-EDITOR", " user-editor"]) {
      expect(getRole(ctx(id, shares))).toBe("none");
    }
  });

  it("prefers the most permissive grant if duplicate rows are passed", () => {
    const viewerFirst: DocumentShare[] = [
      { userId: EDITOR, permission: "viewer" },
      { userId: EDITOR, permission: "editor" },
    ];
    const editorFirst = [...viewerFirst].reverse();
    expect(getRole(ctx(EDITOR, viewerFirst))).toBe("editor");
    expect(getRole(ctx(EDITOR, editorFirst))).toBe("editor");
  });
});

describe("shares are scoped to a single document", () => {
  // The functions only see the shares they are given, so the caller must load
  // shares filtered by document_id. These tests pin down that nothing leaks
  // between two contexts: access on document A says nothing about document B.
  const docAOwner = "owner-a";
  const docBOwner = "owner-b";

  it("a share on document A grants nothing on document B", () => {
    const sharesA: DocumentShare[] = [{ userId: EDITOR, permission: "editor" }];
    const sharesB: DocumentShare[] = [];

    expect(getRole(ctx(EDITOR, sharesA, docAOwner))).toBe("editor");
    expect(getRole(ctx(EDITOR, sharesB, docBOwner))).toBe("none");
  });

  it("being the owner of document A grants nothing on document B", () => {
    expect(getRole(ctx(docAOwner, [], docAOwner))).toBe("owner");
    expect(getRole(ctx(docAOwner, [], docBOwner))).toBe("none");
  });
});

describe("unexpected data fails closed", () => {
  it.each(["admin", "owner", "", "EDITOR", "Viewer"])(
    "ignores a share with unknown permission %j",
    (bogus) => {
      const shares = [{ userId: STRANGER, permission: bogus }] as unknown as DocumentShare[];
      check(ctx(STRANGER, shares), NOTHING);
    },
  );
});

describe("role helpers", () => {
  it.each<[Role, boolean, boolean, boolean, boolean]>([
    // role,    view,  edit,  share, delete
    ["owner", true, true, true, true],
    ["editor", true, true, false, false],
    ["viewer", true, false, false, false],
    ["none", false, false, false, false],
  ])("%s -> view=%s edit=%s share=%s delete=%s", (role, view, edit, share, del) => {
    expect(roleCanView(role)).toBe(view);
    expect(roleCanEdit(role)).toBe(edit);
    expect(roleCanShare(role)).toBe(share);
    expect(roleCanDelete(role)).toBe(del);
  });
});
