import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read Next.js env files, so load .env.local ourselves.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on variables already present in the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
