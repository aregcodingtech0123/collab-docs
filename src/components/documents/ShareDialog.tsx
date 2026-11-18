"use client";

// Owner-only "Share" button + dialog:
//   - lists who the document is shared with (change Viewer/Editor, or Remove)
//   - adds people by picking from the user list or typing an email
// Uses the existing API: GET/POST/DELETE /api/documents/:id/shares and GET /api/users.
// The list is updated in place after every change; the page is never reloaded.

import { useCallback, useRef, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import {
  PERMISSION_HELP,
  PERMISSION_LABEL,
  candidateUsers,
  describeShareError,
  isPlausibleEmail,
  removeShare,
  sortShares,
  upsertShare,
  type ShareEntry,
} from "@/lib/shares";
import { SHARE_PERMISSIONS, type SharePermission, type User } from "@/types";

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  code?: string;
  message?: string;
}

async function api<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (json as T) : null,
      code: json?.error?.code,
      message: json?.error?.message,
    };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

type LoadState = "loading" | "ready" | "error";

export default function ShareDialog({ documentId, ownerId }: { documentId: string; ownerId: string }) {
  const [open, setOpen] = useState(false);

  const [load, setLoad] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [rowPending, setRowPending] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const [pick, setPick] = useState("");
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<SharePermission>("viewer");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadId = useRef(0); // ignore responses from an earlier open/retry

  const loadAll = useCallback(async () => {
    const id = ++loadId.current;
    setLoad("loading");
    setLoadError(null);
    const [sharesRes, usersRes] = await Promise.all([
      api<{ shares: ShareEntry[] }>("GET", `/api/documents/${documentId}/shares`),
      api<{ users: User[] }>("GET", "/api/users"),
    ]);
    if (id !== loadId.current) return;
    if (!sharesRes.ok || !usersRes.ok) {
      const failed = !sharesRes.ok ? sharesRes : usersRes;
      setLoadError(describeShareError(failed.status, failed.code, failed.message));
      setLoad("error");
      return;
    }
    setShares(sortShares(sharesRes.data?.shares ?? []));
    setUsers(usersRes.data?.users ?? []);
    setLoad("ready");
  }, [documentId]);

  function openDialog() {
    // Fresh state, and fresh data from the server, each time the dialog opens.
    setRowError({});
    setFormError(null);
    setNotice(null);
    setPick("");
    setEmail("");
    setPermission("viewer");
    setOpen(true);
    void loadAll();
  }

  function closeDialog() {
    loadId.current++; // drop responses that are still in flight
    setOpen(false);
  }

  const candidates = candidateUsers(users, ownerId, shares);

  async function addPerson(e: FormEvent) {
    e.preventDefault();
    const target = email.trim();
    setNotice(null);
    if (!isPlausibleEmail(target)) {
      setFormError("Enter a valid email address.");
      return;
    }
    setAdding(true);
    setFormError(null);
    const res = await api<{ share: ShareEntry }>("POST", `/api/documents/${documentId}/shares`, {
      email: target,
      permission,
    });
    setAdding(false);
    if (!res.ok || !res.data) {
      setFormError(describeShareError(res.status, res.code, res.message));
      return;
    }
    const { share } = res.data;
    setShares((list) => upsertShare(list, share));
    setPick("");
    setEmail("");
    setNotice(`Shared with ${share.user.name} as ${PERMISSION_LABEL[share.permission]}.`);
  }

  async function changePermission(entry: ShareEntry, next: SharePermission) {
    if (next === entry.permission) return;
    setNotice(null);
    setRowPending((p) => ({ ...p, [entry.user.id]: true }));
    setRowError((r) => ({ ...r, [entry.user.id]: "" }));
    const res = await api<{ share: ShareEntry }>("POST", `/api/documents/${documentId}/shares`, {
      email: entry.user.email,
      permission: next,
    });
    setRowPending((p) => ({ ...p, [entry.user.id]: false }));
    if (!res.ok || !res.data) {
      setRowError((r) => ({ ...r, [entry.user.id]: describeShareError(res.status, res.code, res.message) }));
      return;
    }
    setShares((list) => upsertShare(list, res.data!.share));
    setNotice(`${entry.user.name} is now ${PERMISSION_LABEL[next] === "Editor" ? "an Editor" : "a Viewer"}.`);
  }

  async function remove(entry: ShareEntry) {
    setNotice(null);
    setRowPending((p) => ({ ...p, [entry.user.id]: true }));
    setRowError((r) => ({ ...r, [entry.user.id]: "" }));
    const res = await api<null>("DELETE", `/api/documents/${documentId}/shares`, { userId: entry.user.id });
    setRowPending((p) => ({ ...p, [entry.user.id]: false }));
    // 404 share_not_found means someone already removed it: the list should drop it too.
    if (res.ok || res.code === "share_not_found") {
      setShares((list) => removeShare(list, entry.user.id));
      setNotice(`Removed ${entry.user.name}. They no longer have access.`);
      return;
    }
    setRowError((r) => ({ ...r, [entry.user.id]: describeShareError(res.status, res.code, res.message) }));
  }

  return (
    <>
      <Button onClick={openDialog} aria-haspopup="dialog">
        Share
      </Button>

      <Dialog open={open} onClose={closeDialog} title="Share this document">
        <p className="mt-1 text-sm text-zinc-500">{PERMISSION_HELP}</p>

        <section aria-label="People with access" className="mt-5">
          <h3 className="text-sm font-medium text-zinc-700">People with access</h3>

          {load === "loading" && (
            <p role="status" className="mt-2 text-sm text-zinc-500">
              Loading…
            </p>
          )}

          {load === "error" && (
            <div role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p>{loadError}</p>
              <button type="button" onClick={() => void loadAll()} className="mt-1 font-medium underline hover:no-underline">
                Try again
              </button>
            </div>
          )}

          {load === "ready" && shares.length === 0 && (
            <p className="mt-2 rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-zinc-500">
              Not shared with anyone yet
            </p>
          )}

          {load === "ready" && shares.length > 0 && (
            <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {shares.map((entry) => {
                const busy = rowPending[entry.user.id] === true;
                const error = rowError[entry.user.id];
                return (
                  <li key={entry.user.id} className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.user.name}</p>
                        <p className="truncate text-xs text-zinc-500">{entry.user.email}</p>
                      </div>
                      <select
                        aria-label={`Permission for ${entry.user.name}`}
                        value={entry.permission}
                        disabled={busy}
                        onChange={(e) => void changePermission(entry, e.target.value as SharePermission)}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-60"
                      >
                        {SHARE_PERMISSIONS.map((p) => (
                          <option key={p} value={p}>
                            {PERMISSION_LABEL[p]}
                          </option>
                        ))}
                      </select>
                      <Button variant="ghost" aria-label={`Remove ${entry.user.name}`} disabled={busy} onClick={() => void remove(entry)}>
                        Remove
                      </Button>
                    </div>
                    {error && (
                      <p role="alert" className="mt-1 text-sm text-red-600">
                        {error}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {load === "ready" && (
          <form onSubmit={addPerson} noValidate className="mt-6 border-t border-zinc-100 pt-5">
            <h3 className="text-sm font-medium text-zinc-700">Add a person</h3>

            {candidates.length > 0 && (
              <select
                aria-label="Choose a person"
                value={pick}
                disabled={adding}
                onChange={(e) => {
                  setPick(e.target.value);
                  setEmail(e.target.value); // the option value is the person's email
                  setFormError(null);
                }}
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60"
              >
                <option value="">Choose a person…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="email"
                aria-label="Email address"
                placeholder={candidates.length > 0 ? "or type an email address" : "Email address"}
                autoComplete="off"
                value={email}
                disabled={adding}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setPick(""); // typing replaces the dropdown choice
                  setFormError(null);
                }}
                // Full-width row on phones, so the address is readable; shares a row with the
                // permission select and the button from the "sm" breakpoint up.
                className="min-w-0 basis-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-60 sm:flex-1 sm:basis-auto"
              />
              <select
                aria-label="Permission for the new person"
                value={permission}
                disabled={adding}
                onChange={(e) => setPermission(e.target.value as SharePermission)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60"
              >
                {SHARE_PERMISSIONS.map((p) => (
                  <option key={p} value={p}>
                    {PERMISSION_LABEL[p]}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="primary" disabled={adding || email.trim() === ""}>
                {adding ? "Sharing…" : "Share"}
              </Button>
            </div>

            {formError && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {formError}
              </p>
            )}
          </form>
        )}

        {/* Polite announcements for screen readers and a visible confirmation. */}
        <p aria-live="polite" className="mt-4 min-h-5 text-sm text-green-700">
          {notice}
        </p>

        <div className="mt-2 flex justify-end">
          <Button onClick={closeDialog}>Done</Button>
        </div>
      </Dialog>
    </>
  );
}
