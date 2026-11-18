// Mock login: lists the seeded users as buttons (see components/LoginForm.tsx).

import { connection } from "next/server";
import LoginForm from "@/components/LoginForm";
import { listUsers } from "@/lib/auth";

export default async function LoginPage() {
  // Read the users on every request, not at build time.
  await connection();
  const users = await listUsers();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold">Collab Docs</h1>
      <p className="mt-2 mb-8 text-sm text-zinc-500">
        Pick a user to continue. This is a demo: there are no passwords.
      </p>
      <LoginForm users={users} />
    </main>
  );
}
