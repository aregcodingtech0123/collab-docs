"use client";

// Create an empty document (POST /api/documents) and open it.

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";

export default function NewDocumentButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error("create failed");
      const { document } = (await res.json()) as { document: { id: string } };
      router.push(`/documents/${document.id}`);
      // Keep the button in its pending state until the navigation replaces the page.
    } catch {
      setError("Couldn't create the document. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="primary" onClick={create} disabled={pending}>
        {pending ? "Creating…" : "New document"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
