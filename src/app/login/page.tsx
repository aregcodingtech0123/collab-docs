// Seeded user picker. TODO: list users, POST /api/auth/login, redirect to /documents.

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Pick a user to continue. (TODO: user picker)
      </p>
    </main>
  );
}
