"use client";

// Inline-editable document title (owner/editor only; read-only text for viewers).
// TODO: PATCH /api/documents/[id] with { title }.

export default function RenameTitle({
  documentId,
  title,
  editable,
}: {
  documentId: string;
  title: string;
  editable: boolean;
}) {
  return (
    <h1 data-document-id={documentId} data-editable={editable}>
      {title}
    </h1>
  );
}
