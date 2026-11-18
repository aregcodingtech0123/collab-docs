"use client";

// Mock login: one button per seeded user. POSTs the email to /api/auth/login,
// then goes to /documents.

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface LoginUser {
  id: string;
  name: string;
  email: string;
}

export default function LoginForm({ users }: { users: LoginUser[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(user: LoginUser) {
    setPending(user.id);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Could not sign in");
      }
      router.push("/documents");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setPending(null);
    }
  }

  if (users.length === 0) {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        No users found. Run <code className="font-mono">npm run db:seed</code> first.
      </p>
    );
  }

  return (
    <div>
      <ul className="space-y-3">
        {users.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => signIn(user)}
              disabled={pending !== null}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-300 px-4 py-3 text-left transition hover:bg-zinc-50 disabled:opacity-60"
            >
              <span className="font-medium">
                {pending === user.id ? "Signing in…" : `Continue as ${user.name}`}
              </span>
              <span className="text-sm text-zinc-500">{user.email}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
