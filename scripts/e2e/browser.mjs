// Runs every browser suite in sequence (npm run e2e:browser), re-seeding before each and at the end.
// Needs Chrome or Edge installed (see lib/browser.mjs). Screenshots are written to ./e2e-output.
// Usage: npm run e2e:browser [-- http://localhost:3000]
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, OUT, assertSafeTarget, preflight, reseed } from "./lib/env.mjs";

assertSafeTarget("Browser suites (editor, import + sharing, polish)");
await preflight();

const dir = path.dirname(fileURLToPath(import.meta.url));
const suites = ["browser-editor.mjs", "browser-share-import.mjs", "browser-polish.mjs"];
const results = [];

for (const suite of suites) {
  reseed();
  const r = spawnSync(process.execPath, [path.join(dir, suite), BASE], { stdio: "inherit", env: process.env });
  results.push([suite, r.status === 0]);
}
reseed();

console.log("\n== Browser e2e summary ==");
for (const [suite, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${suite}`);
console.log(`Screenshots: ${OUT}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
