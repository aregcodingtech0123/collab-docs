"use client";

// Import a .txt / .md / .docx file as a new document (POST /api/documents/import),
// then open it. The limits are stated next to the button and checked here first
// for quick feedback; the server enforces them again.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import {
  IMPORT_LIMITS_TEXT,
  MAX_IMPORT_BYTES,
  SUPPORTED_EXTENSIONS,
  UNSUPPORTED_TYPE_MESSAGE,
  extensionOf,
  isSupportedExtension,
} from "@/lib/import/limits";

const ACCEPT = SUPPORTED_EXTENSIONS.join(",");

export default function ImportButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!isSupportedExtension(extensionOf(file.name))) return setError(UNSUPPORTED_TYPE_MESSAGE);
    if (file.size === 0) return setError("The file is empty. Choose a file that contains some text.");
    if (file.size > MAX_IMPORT_BYTES) return setError("This file is too large. The limit is 2 MB.");

    setPending(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/documents/import", { method: "POST", body });

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        // Our API's messages for 400/413 are written for users; anything else is generic.
        const data = await res.json().catch(() => null);
        const readable = res.status === 400 || res.status === 413;
        setError(readable && data?.error?.message ? data.error.message : "Couldn't import the file. Please try again.");
        setPending(false);
        return;
      }
      const { document } = (await res.json()) as { document: { id: string } };
      router.push(`/documents/${document.id}`); // stays "pending" until the page changes
    } catch {
      setError("Couldn't import the file. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        aria-label="Choose a file to import"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow choosing the same file again
          if (file) void upload(file);
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={pending} aria-describedby="import-help">
        {pending ? "Importing…" : "Import file"}
      </Button>
      <p id="import-help" className="max-w-[16rem] text-xs text-zinc-500 sm:text-right">
        {IMPORT_LIMITS_TEXT}
      </p>
      {error && (
        <p role="alert" className="max-w-xs text-sm text-red-600 sm:text-right">
          {error}
        </p>
      )}
    </div>
  );
}
