// Shared helpers for the e2e suites: target URL, SAFETY GUARD, seed reset, result checker.
//
// The suites create, edit, share and delete documents and then reset the database to its
// seed state. They are meant for a local server and a development database.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Base URL: first http(s) argument, else E2E_BASE_URL, else http://localhost:3000. */
export const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Where screenshots go (git-ignored). */
export const OUT = path.resolve(ROOT, process.env.E2E_OUT ?? "e2e-output");

/** Ids of the seeded sample documents (see src/db/seed-data.ts). */
export const SEED = {
  welcome: "a0000000-0000-4000-8000-000000000001", // Alice owns; Bob is editor
  bobNotes: "a0000000-0000-4000-8000-000000000002", // Bob owns; private
  carolPlan: "a0000000-0000-4000-8000-000000000003", // Carol owns; Alice is viewer
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLocalTarget(base = BASE) {
  try {
    return LOCAL_HOSTS.has(new URL(base).hostname);
  } catch {
    return false;
  }
}

/**
 * Refuse to run against anything but localhost unless E2E_ALLOW_REMOTE=1, and say clearly
 * what the suites do. The banner is printed once per `npm run` (child suites skip it).
 */
export function assertSafeTarget(suiteName) {
  let valid = true;
  try {
    new URL(BASE);
  } catch {
    valid = false;
  }
  if (!valid) {
    console.error(`E2E: "${BASE}" is not a valid URL.`);
    process.exit(2);
  }

  if (!isLocalTarget() && process.env.E2E_ALLOW_REMOTE !== "1") {
    console.error(
      `\nE2E REFUSED: ${BASE} is not localhost.\n` +
        "These suites create, rename, share and delete documents and RESET sample data.\n" +
        "Run them against a local server and a development database.\n" +
        "To run against a remote target anyway, set E2E_ALLOW_REMOTE=1 (and be sure that is what you want).\n",
    );
    process.exit(2);
  }

  if (process.env.E2E_BANNER_SHOWN !== "1") {
    process.env.E2E_BANNER_SHOWN = "1";
    const remote = !isLocalTarget();
    console.warn(
      "\n" +
        "==================================================================\n" +
        ` E2E: ${suiteName}\n` +
        ` Target: ${BASE}${remote ? "   (REMOTE: E2E_ALLOW_REMOTE=1)" : ""}\n` +
        "------------------------------------------------------------------\n" +
        " This will CHANGE DATA in the database your server uses:\n" +
        "  - creates, renames, edits, shares and deletes documents,\n" +
        "  - imports files, and removes/restores shares on the sample docs,\n" +
        (remote
          ? "  - it will NOT reset the database for you (remote target): re-seed it yourself.\n"
          : "  - then resets the sample users/documents with `npm run db:seed`\n" +
            "    (using DATABASE_URL from your .env.local; the value is never printed).\n") +
        " Use a development database, not one that holds real data.\n" +
        "==================================================================\n",
    );
  }
}

/** Reset the sample data (local targets only). Prints one summary line, never credentials. */
export function reseed() {
  if (!isLocalTarget()) {
    console.log("(remote target: not re-seeding; reset the database yourself if needed)");
    return true;
  }
  const r = spawnSync("npm", ["run", "db:seed"], { cwd: ROOT, shell: true, encoding: "utf8" });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const summary = out.split("\n").find((l) => /Verified in DB|Seed failed/.test(l));
  console.log(r.status === 0 ? `(seed) ${summary?.trim() ?? "ok"}` : `(seed) FAILED: ${summary?.trim() ?? "see npm run db:seed"}`);
  return r.status === 0;
}

/** Check that the server is up and the DB is seeded, with a helpful message otherwise. */
export async function preflight() {
  let html;
  try {
    html = await (await fetch(`${BASE}/login`)).text();
  } catch {
    console.error(`E2E: could not reach ${BASE}. Start the app first (npm run build && npm start, or npm run dev).`);
    process.exit(2);
  }
  if (!html.includes("Continue as Alice")) {
    console.error("E2E: the login page does not list the demo users. Run `npm run db:seed` first.");
    process.exit(2);
  }
}

/** Collects PASS/FAIL rows; `report()` prints a markdown table and returns the failure count. */
export function createChecker() {
  const rows = [];
  let fails = 0;
  return {
    rows,
    check(label, expected, actual) {
      const ok = String(expected) === String(actual);
      if (!ok) fails++;
      rows.push(`| ${label} | ${expected} | ${actual} | ${ok ? "PASS" : "FAIL"} |`);
    },
    report(name) {
      console.log(`\n### ${name}\n| Check | Expected | Actual | |\n|---|---|---|---|\n${rows.join("\n")}`);
      console.log(`\n${rows.length - fails}/${rows.length} passed${fails ? `, ${fails} FAILED` : ""}`);
      return fails;
    },
    get fails() {
      return fails;
    },
  };
}

/** Log in through the API and return the session cookie ("name=value"). */
export async function apiLogin(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (res.status !== 200) throw new Error(`login as ${email} failed (${res.status}); is the database seeded?`);
  return res.headers.getSetCookie()[0].split(";")[0];
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
