// Documents list: "My documents" and "Shared with me". Rendered on the server,
// using the same query as GET /api/documents (listDocuments).

import DocumentList from "@/components/documents/DocumentList";
import ImportButton from "@/components/documents/ImportButton";
import NewDocumentButton from "@/components/documents/NewDocumentButton";
import { requireUserOrRedirect } from "@/lib/auth";
import { listDocuments } from "@/lib/documents";

export const metadata = { title: "Documents · Collab Docs" };

export default async function DocumentsPage() {
  const user = await requireUserOrRedirect();
  const { owned, shared } = await listDocuments(user.id);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <div className="flex items-start gap-2">
          <ImportButton />
          <NewDocumentButton />
        </div>
      </div>

      <DocumentList
        title="My documents"
        documents={owned}
        emptyMessage="You don't have any documents yet. Create one with “New document”."
      />
      <DocumentList
        title="Shared with me"
        documents={shared}
        emptyMessage="Nothing has been shared with you yet. Documents other people share with you will show up here."
      />
    </main>
  );
}
