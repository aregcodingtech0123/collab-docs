// Renders a list of DocumentCards, with an empty state.
// TODO: empty state copy, ordering (most recently updated first).

import type { DocumentSummary } from "@/types";

export default function DocumentList({
  documents,
}: {
  documents: DocumentSummary[];
}) {
  return (
    <ul className="mt-3 space-y-2">
      {documents.length === 0 && (
        <li className="text-sm text-zinc-500">No documents yet.</li>
      )}
      {/* TODO: map documents -> <DocumentCard /> */}
    </ul>
  );
}
