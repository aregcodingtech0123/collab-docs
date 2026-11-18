"use client";

// Shown when something unexpected fails while rendering a /documents page.
// Deliberately generic: no stack traces or technical details in the UI.

import Link from "next/link";
import Button from "@/components/ui/Button";

export default function DocumentsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold text-zinc-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-600">
        We couldn&apos;t load this page. Your documents are safe. Please try again.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link href="/documents" className="text-sm font-medium text-zinc-700 underline hover:no-underline">
          Back to documents
        </Link>
      </div>
    </main>
  );
}
