// Shown for a missing document AND for one the user may not open (same page, so
// the existence of other people's documents is not revealed).

import Link from "next/link";

export default function DocumentNotFound() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold text-zinc-900">Document not found</h1>
      <p className="mt-2 text-sm text-zinc-600">
        This document doesn&apos;t exist, was deleted, or you don&apos;t have access to it. If you expected to see
        it, ask the owner to share it with you.
      </p>
      <Link
        href="/documents"
        className="mt-6 inline-block rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Back to documents
      </Link>
    </main>
  );
}
