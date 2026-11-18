import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { SEED_DOCUMENTS, SEED_USERS } from "@/db/seed-data";
import { createExtensions } from "@/lib/tiptap";
import { idSchema, tiptapDocSchema } from "@/lib/validation";
import type { TipTapNode } from "@/types";

// The seed data must be valid for the real editor schema (no DB needed).
const schema = getSchema(createExtensions());

function collect(node: TipTapNode, out: { nodes: Set<string>; marks: Set<string> }) {
  out.nodes.add(node.type);
  node.marks?.forEach((m) => out.marks.add(m.type));
  node.content?.forEach((c) => collect(c, out));
}

describe("seed data", () => {
  it.each(SEED_DOCUMENTS.map((d) => [d.title, d] as const))("%s is valid TipTap content", (_t, d) => {
    expect(tiptapDocSchema.safeParse(d.content).success).toBe(true);
    // nodeFromJSON + check() throw if the JSON does not fit the editor schema.
    expect(() => schema.nodeFromJSON(d.content).check()).not.toThrow();
  });

  it("uses headings, bold/italic/underline, a bullet list and a numbered list", () => {
    const used = { nodes: new Set<string>(), marks: new Set<string>() };
    SEED_DOCUMENTS.forEach((d) => collect(d.content, used));
    expect(used.nodes).toContain("heading");
    expect(used.nodes).toContain("bulletList");
    expect(used.nodes).toContain("orderedList");
    expect([...used.marks]).toEqual(expect.arrayContaining(["bold", "italic", "underline"]));
  });

  it("has unique, valid document ids", () => {
    const ids = SEED_DOCUMENTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(idSchema.safeParse(id).success).toBe(true));
  });

  it("only references seeded users and never shares with the owner", () => {
    const emails = new Set<string>(SEED_USERS.map((u) => u.email));
    for (const d of SEED_DOCUMENTS) {
      expect(emails).toContain(d.ownerEmail);
      for (const s of d.shares) {
        expect(emails).toContain(s.email);
        expect(s.email).not.toBe(d.ownerEmail);
      }
    }
  });

  it("matches the documented scenario", () => {
    const by = (title: string) => SEED_DOCUMENTS.find((d) => d.title === title);
    expect(by("Welcome to Collab Docs")).toMatchObject({
      ownerEmail: "alice@example.com",
      shares: [{ email: "bob@example.com", permission: "editor" }],
    });
    expect(by("Bob's meeting notes")).toMatchObject({ ownerEmail: "bob@example.com", shares: [] });
    expect(by("Carol's project plan")).toMatchObject({
      ownerEmail: "carol@example.com",
      shares: [{ email: "alice@example.com", permission: "viewer" }],
    });
  });
});
