// Sample data for `npm run db:seed`. Pure data (no DB access) so tests can validate it.
// Document ids are fixed so the seed can upsert them and stay idempotent.

import type { SharePermission, TipTapDoc, TipTapNode } from "../types";

// ---- tiny TipTap JSON builders -------------------------------------------------

type Mark = "bold" | "italic" | "underline";

function text(value: string, ...marks: Mark[]): TipTapNode {
  return marks.length
    ? { type: "text", text: value, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: value };
}

function p(...content: (TipTapNode | string)[]): TipTapNode {
  return {
    type: "paragraph",
    content: content.map((c) => (typeof c === "string" ? text(c) : c)),
  };
}

function h(level: 1 | 2 | 3, value: string): TipTapNode {
  return { type: "heading", attrs: { level }, content: [text(value)] };
}

function listItem(...content: (TipTapNode | string)[]): TipTapNode {
  return { type: "listItem", content: [p(...content)] };
}

function ul(...items: TipTapNode[]): TipTapNode {
  return { type: "bulletList", content: items };
}

function ol(...items: TipTapNode[]): TipTapNode {
  return { type: "orderedList", attrs: { start: 1 }, content: items };
}

function doc(...content: TipTapNode[]): TipTapDoc {
  return { type: "doc", content };
}

// ---- users ---------------------------------------------------------------------

export const SEED_USERS = [
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" },
  { name: "Carol", email: "carol@example.com" },
] as const;

// ---- documents -----------------------------------------------------------------

export interface SeedDocument {
  id: string;
  title: string;
  ownerEmail: string;
  content: TipTapDoc;
  shares: { email: string; permission: SharePermission }[];
}

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    title: "Welcome to Collab Docs",
    ownerEmail: "alice@example.com",
    shares: [{ email: "bob@example.com", permission: "editor" }],
    content: doc(
      h(1, "Welcome to Collab Docs"),
      p(
        "This is a ",
        text("lightweight", "bold"),
        " collaborative editor. You can write ",
        text("bold", "bold"),
        ", ",
        text("italic", "italic"),
        " and ",
        text("underlined", "underline"),
        " text, or combine them: ",
        text("bold italic underline", "bold", "italic", "underline"),
        ".",
      ),
      h(2, "What you can do"),
      ul(
        listItem("Create, rename and delete documents"),
        listItem("Share a document as ", text("viewer", "italic"), " or ", text("editor", "italic")),
        listItem("Import ", text(".txt", "bold"), ", ", text(".md", "bold"), " and ", text(".docx", "bold"), " files"),
      ),
      h(2, "Getting started"),
      ol(
        listItem("Pick a user on the login page"),
        listItem("Open or create a document"),
        listItem("Start typing: changes are saved automatically"),
      ),
      p("Bob can edit this document because Alice shared it with him as an editor."),
    ),
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    title: "Bob's meeting notes",
    ownerEmail: "bob@example.com",
    shares: [],
    content: doc(
      h(1, "Weekly sync"),
      p("Private notes. Nobody else can see this document."),
      h(2, "Action items"),
      ul(listItem("Review the ", text("API", "bold"), " draft"), listItem("Book the demo room")),
    ),
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    title: "Carol's project plan",
    ownerEmail: "carol@example.com",
    shares: [{ email: "alice@example.com", permission: "viewer" }],
    content: doc(
      h(1, "Project plan"),
      p("Alice can read this plan but not change it (viewer access)."),
      h(2, "Milestones"),
      ol(
        listItem(text("Design", "bold"), " review"),
        listItem(text("Build", "bold"), " the first version"),
        listItem(text("Ship", "bold", "underline"), " it"),
      ),
      p(text("Status: ", "italic"), "on track."),
    ),
  },
];
