"use client";

// Document title. Owners/editors can edit it inline (saved on blur or Enter);
// viewers see plain text. Invalid or failed renames show a message and revert.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { validateTitle } from "@/lib/title";

async function errorMessageFor(res: Response): Promise<string> {
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You no longer have permission to rename this document.";
  if (res.status === 404) return "This document is no longer available.";
  if (res.status === 400) {
    const body = await res.json().catch(() => null);
    return body?.error?.message ?? "That title isn't valid.";
  }
  return "Couldn't rename the document. Please try again.";
}

export default function RenameTitle({
  documentId,
  title,
  editable,
}: {
  documentId: string;
  title: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(title); // last title the server accepted
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const skipNextCommit = useRef(false);

  if (!editable) {
    return <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>;
  }

  async function commit() {
    if (skipNextCommit.current) {
      skipNextCommit.current = false;
      return;
    }
    if (pending) return;

    const result = validateTitle(value);
    if (!result.ok) {
      setError(result.message);
      setValue(confirmed);
      return;
    }
    if (result.value === confirmed) {
      setValue(confirmed); // drop stray whitespace
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: result.value }),
      });
      if (!res.ok) {
        setError(await errorMessageFor(res));
        setValue(confirmed);
        return;
      }
      setConfirmed(result.value);
      setValue(result.value);
      router.refresh(); // update the browser tab title and any server-rendered copy
    } catch {
      setError("Couldn't rename the document. Check your connection and try again.");
      setValue(confirmed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <input
        aria-label="Document title"
        aria-invalid={error !== null}
        aria-describedby={error ? "title-error" : undefined}
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur(); // blur -> commit
          } else if (e.key === "Escape") {
            skipNextCommit.current = true;
            setValue(confirmed);
            setError(null);
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 -mx-2 text-2xl font-semibold text-zinc-900 outline-none transition hover:border-zinc-300 focus:border-blue-500 focus:bg-white disabled:opacity-60"
      />
      {error && (
        <p id="title-error" role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
