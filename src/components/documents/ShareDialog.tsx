"use client";

// Owner-only dialog to share a document with another user as viewer or editor.
// TODO: GET /api/users, GET/POST/DELETE /api/documents/[id]/shares.

export default function ShareDialog({ documentId }: { documentId: string }) {
  return <div data-document-id={documentId} hidden />;
}
