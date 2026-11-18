"use client";

// TODO: file picker -> POST multipart to /api/documents/import -> open the new document.
// The UI must state the supported types (.txt, .md, .docx) and the size limit.

export default function ImportButton() {
  return (
    <button type="button" title="Supported file types: .txt, .md, .docx">
      Import (.txt .md .docx)
    </button>
  );
}
