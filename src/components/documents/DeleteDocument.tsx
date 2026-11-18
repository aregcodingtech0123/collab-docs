"use client";

// Owner-only "Delete" with a confirmation dialog (same native-dialog behaviour as sharing:
// focus moves in, Tab is trapped, Esc closes, focus returns to the Delete button).
// Calls DELETE /api/documents/:id and then goes back to the list.

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";

function messageFor(status: number): string {
  if (status === 401) return "Your session has ended. Please sign in again.";
  if (status === 403) return "Only the owner can delete this document.";
  return "Couldn't delete the document. Please try again.";
}

export default function DeleteDocument({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setError(null);
    setOpen(true);
  }

  async function confirmDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      // 404: it is already gone (deleted elsewhere), which is what the user wanted.
      if (res.ok || res.status === 404) {
        router.push("/documents");
        router.refresh();
        return; // stay "pending" until the navigation replaces this page
      }
      setError(messageFor(res.status));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <>
      <Button onClick={openDialog} aria-haspopup="dialog">
        Delete
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Delete this document?" dismissible={!pending}>
        <p className="mt-3 text-sm text-zinc-600">
          This permanently deletes the document for you and for everyone it is shared with. This can&apos;t be
          undone.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {/* Safe default: focus starts on Cancel, not on the destructive action. */}
          <Button data-autofocus onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirmDelete()} disabled={pending}>
            {pending ? "Deleting…" : "Delete document"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
