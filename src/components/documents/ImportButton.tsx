"use client";

// TODO: file picker -> POST multipart to /api/documents/import -> open the new document.
// The UI must state the supported types (.txt, .md, .docx) and the size limit.
// Disabled until the import feature is built.

import Button from "@/components/ui/Button";

export default function ImportButton() {
  return (
    <Button disabled title="Import (.txt, .md, .docx) is coming soon">
      Import (.txt .md .docx)
    </Button>
  );
}
