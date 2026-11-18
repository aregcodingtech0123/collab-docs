"use client";

// TipTap editor wrapper.
// TODO: useEditor() with createExtensions() from @/lib/tiptap, load initialContent,
// debounce-save via PATCH /api/documents/[id], honour `editable` (viewers are read-only).

import type { TipTapDoc } from "@/types";

export interface EditorProps {
  documentId: string;
  initialContent: TipTapDoc;
  editable: boolean;
}

export default function Editor({ documentId, editable }: EditorProps) {
  return (
    <div
      className="min-h-64 rounded border border-zinc-200 p-4 text-sm text-zinc-500"
      data-document-id={documentId}
      data-editable={editable}
    >
      Editor (TODO)
    </div>
  );
}
