// Editor page for a single document.
//   not signed in            -> redirect to /login
//   missing / no access      -> notFound() (same page for both: existence is not leaked)
//   owner / editor           -> editable editor with autosave
//   viewer                   -> read-only editor
//
// The loader RETURNS a result instead of throwing so generateMetadata can use it
// too: calling notFound()/redirect() from generateMetadata makes Next skip the
// segment's not-found.tsx and send a bare shell, so only the page itself throws.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import Editor from "@/components/editor/Editor";
import { getCurrentUser } from "@/lib/auth";
import { loadContent, requireDocumentAccess, type DocumentMeta, type GrantedRole } from "@/lib/documents";
import { ApiError } from "@/lib/errors";
import { idSchema } from "@/lib/validation";
import type { TipTapDoc, User } from "@/types";

type Loaded =
  | { state: "signed-out" }
  | { state: "not-found" }
  | { state: "ok"; user: User; document: DocumentMeta; role: GrantedRole; content: TipTapDoc };

/** Shared by the page and generateMetadata; cache() makes it one load per request. */
const load = cache(async (rawId: string): Promise<Loaded> => {
  const user = await getCurrentUser();
  if (!user) return { state: "signed-out" };

  const id = idSchema.safeParse(rawId);
  if (!id.success) return { state: "not-found" };

  try {
    const { document, role } = await requireDocumentAccess(id.data, user.id, "view");
    const content = await loadContent(id.data);
    return { state: "ok", user, document, role, content };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { state: "not-found" };
    throw err;
  }
});

export async function generateMetadata({ params }: PageProps<"/documents/[id]">): Promise<Metadata> {
  const { id } = await params;
  const result = await load(id);
  if (result.state === "ok") return { title: `${result.document.title} · Collab Docs` };
  return { title: "Document not found · Collab Docs" };
}

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const result = await load(id);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "not-found") notFound();

  const { user, document, role, content } = result;
  return (
    <main>
      <Editor
        key={document.id}
        documentId={document.id}
        title={document.title}
        initialContent={content}
        role={role}
        ownerName={document.owner.name}
        isOwner={document.ownerId === user.id}
      />
    </main>
  );
}
