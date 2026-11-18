// Seed script (run with `npm run db:seed`).
// TODO: insert users alice, bob, carol + sample documents (one shared).
// Must be idempotent (safe to run repeatedly).

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: fall back to variables already present in the environment.
}

async function main(): Promise<void> {
  // TODO: implement
  console.log("db:seed is not implemented yet.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
