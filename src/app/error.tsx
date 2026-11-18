"use client";

// Last-resort error page for routes outside /documents (the login page, the home page).
// Deliberately generic: no stack traces, error messages or digests in the UI. The real
// error (for example a missing DATABASE_URL) is in the server logs.

import Button from "@/components/ui/Button";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold text-zinc-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-600">
        We couldn&apos;t load this page. Please try again in a moment.
      </p>
      <div className="mt-6">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
