"use client";

// Switch to another seeded user: POST /api/auth/login with their email, then go to
// /documents (a document you could open as one user may be a 404 for another).

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@/types";

export default function UserSwitcher({ current, users }: { current: User; users: User[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(email: string) {
    if (email === current.email) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Could not switch user");
      router.push("/documents");
      router.refresh();
    } catch {
      setError("Couldn't switch user. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="user-switcher" className="text-sm text-zinc-500">
        Signed in as
      </label>
      <select
        id="user-switcher"
        aria-label="Switch user"
        value={current.email}
        disabled={pending}
        onChange={(e) => switchTo(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-medium text-zinc-900 disabled:opacity-60"
      >
        {users.map((u) => (
          <option key={u.id} value={u.email}>
            {u.name}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-sm text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
