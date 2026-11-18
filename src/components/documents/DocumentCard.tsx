// A single document row/card: title, last updated, and an Owner / Shared badge.
// TODO: link to /documents/[id], render <Badge> based on `document.role`.

import type { DocumentSummary } from "@/types";

export default function DocumentCard({
  document,
}: {
  document: DocumentSummary;
}) {
  return <li>{document.title}</li>;
}
