// Mock login: lists the seeded users as buttons (see components/LoginForm.tsx).

import { connection } from "next/server";
import LoginForm from "@/components/LoginForm";
import { listUsers } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Read the users on every request, not at build time.
  await connection();
  const users = await listUsers();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-semibold">Collab Docs</h1>
      <p className="mt-2 text-sm text-zinc-700">Pick a demo account to continue.</p>
      <p className="mt-1 mb-8 text-sm text-zinc-500">
        These are demo accounts with <strong className="font-medium text-zinc-700">no password</strong>. You can
        switch between them at any time from the header, for example to try sharing a document.
      </p>
      <LoginForm users={users} />
    </main>
  );
}
