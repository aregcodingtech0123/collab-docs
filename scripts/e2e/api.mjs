// Runs every API suite in sequence (npm run e2e:api), re-seeding before each and at the end.
// Usage: npm run e2e:api [-- http://localhost:3000]
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, assertSafeTarget, preflight, reseed } from "./lib/env.mjs";

assertSafeTarget("API suites (core, pages, import, fuzz)");
await preflight();

const dir = path.dirname(fileURLToPath(import.meta.url));
const suites = ["api-core.mjs", "api-pages.mjs", "api-import.mjs", "api-fuzz.mjs"];
const results = [];

for (const suite of suites) {
  reseed();
  const r = spawnSync(process.execPath, [path.join(dir, suite), BASE], { stdio: "inherit", env: process.env });
  results.push([suite, r.status === 0]);
}
reseed();

console.log("\n== API e2e summary ==");
for (const [suite, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${suite}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
