// Seed script: `npm run db:seed`. Idempotent, so it is safe to run repeatedly.
//   - users are upserted by email
//   - sample documents have fixed ids and are upserted (their title/content are reset)
//   - the shares of the sample documents are replaced on every run
// Anything else in the database (other users' documents, other shares) is left alone.

import { inArray, sql } from "drizzle-orm";
import { getDb } from "./index";
import { SEED_DOCUMENTS, SEED_USERS } from "./seed-data";
import { documentShares, documents, users } from "./schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: fall back to variables already present in the environment.
}

async function main(): Promise<void> {
  const db = getDb();

  // 1. Users (upsert by email).
  const userRows = await db
    .insert(users)
    .values(SEED_USERS.map((u) => ({ name: u.name, email: u.email })))
    .onConflictDoUpdate({ target: users.email, set: { name: sql`excluded.name` } })
    .returning();
  const idByEmail = new Map(userRows.map((u) => [u.email, u.id]));
  const userId = (email: string): string => {
    const id = idByEmail.get(email);
    if (!id) throw new Error(`Seed references unknown user ${email}`);
    return id;
  };

  // 2. Sample documents (upsert by fixed id).
  await db
    .insert(documents)
    .values(
      SEED_DOCUMENTS.map((d) => ({
        id: d.id,
        ownerId: userId(d.ownerEmail),
        title: d.title,
        content: d.content,
      })),
    )
    .onConflictDoUpdate({
      target: documents.id,
      set: {
        ownerId: sql`excluded.owner_id`,
        title: sql`excluded.title`,
        content: sql`excluded.content`,
        updatedAt: new Date(),
      },
    });

  // 3. Reset the shares of the sample documents. db.batch() runs as a single
  //    atomic request on the neon-http driver (there are no interactive transactions).
  const docIds = SEED_DOCUMENTS.map((d) => d.id);
  const shareRows = SEED_DOCUMENTS.flatMap((d) =>
    d.shares.map((s) => ({
      documentId: d.id,
      userId: userId(s.email),
      permission: s.permission,
    })),
  );
  const deleteOld = db.delete(documentShares).where(inArray(documentShares.documentId, docIds));
  if (shareRows.length > 0) {
    await db.batch([deleteOld, db.insert(documentShares).values(shareRows)]);
  } else {
    await deleteOld;
  }

  // 4. Summary (no secrets).
  const emailById = new Map(userRows.map((u) => [u.id, u.email]));
  console.log("Seeded users:");
  for (const u of userRows) console.log(`  ${u.name.padEnd(6)} ${u.email}`);

  console.log("Seeded documents:");
  for (const d of SEED_DOCUMENTS) {
    const sharedWith = d.shares.length
      ? d.shares.map((s) => `${s.email} (${s.permission})`).join(", ")
      : "not shared";
    console.log(`  "${d.title}" owner=${d.ownerEmail}; ${sharedWith}`);
  }

  // Read back what is actually in the DB for the seeded documents.
  const stored = await db
    .select({ id: documentShares.documentId, userId: documentShares.userId, permission: documentShares.permission })
    .from(documentShares)
    .where(inArray(documentShares.documentId, docIds));
  const docCount = await db.select({ id: documents.id }).from(documents).where(inArray(documents.id, docIds));
  console.log(
    `Verified in DB: ${docCount.length} sample documents, ${stored.length} shares` +
      (stored.length ? ` (${stored.map((s) => `${emailById.get(s.userId)}:${s.permission}`).join(", ")})` : ""),
  );
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
