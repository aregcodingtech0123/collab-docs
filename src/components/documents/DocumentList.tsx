// A titled list of DocumentCards, with an empty state.

import DocumentCard from "@/components/documents/DocumentCard";
import type { DocumentSummary } from "@/types";

export default function DocumentList({
  title,
  documents,
  emptyMessage,
}: {
  title: string;
  documents: DocumentSummary[];
  emptyMessage: string;
}) {
  const headingId = `list-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="text-lg font-semibold text-zinc-900">
        {title}
      </h2>
      {documents.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-white/60 px-4 py-6 text-center text-sm text-zinc-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {documents.map((d) => (
            <DocumentCard key={d.id} document={d} />
          ))}
        </ul>
      )}
    </section>
  );
}
