// Neon (HTTP) + Drizzle client. Reads DATABASE_URL lazily so that `next build`
// and unit tests do not require a database connection.
//
// Note: the neon-http driver does not support interactive transactions. Use
// single statements or `db.batch([...])` when atomicity is needed.

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

let instance: Database | undefined;

export function getDb(): Database {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
      );
    }
    instance = drizzle(neon(url), { schema });
  }
  return instance;
}

export { schema };
