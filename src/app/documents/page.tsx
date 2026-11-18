// Documents list: "My documents" and "Shared with me".
// TODO: load the current user's documents (behind <Suspense>) and render DocumentList.

import DocumentList from "@/components/documents/DocumentList";
import ImportButton from "@/components/documents/ImportButton";
import NewDocumentButton from "@/components/documents/NewDocumentButton";
import UserSwitcher from "@/components/UserSwitcher";

export default function DocumentsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <div className="flex items-center gap-2">
          <NewDocumentButton />
          <ImportButton />
          <UserSwitcher />
        </div>
      </header>
      <section className="mt-8">
        <h2 className="text-lg font-medium">My documents</h2>
        <DocumentList documents={[]} />
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-medium">Shared with me</h2>
        <DocumentList documents={[]} />
      </section>
    </main>
  );
}
