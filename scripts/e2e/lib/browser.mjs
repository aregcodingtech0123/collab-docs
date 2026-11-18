// Launches a locally installed Chrome or Edge through playwright-core (no browser download).

import fs from "node:fs";
import { chromium } from "playwright-core";
import { OUT } from "./env.mjs";

/**
 * Tries, in order: E2E_BROWSER_PATH (an executable), E2E_BROWSER_CHANNEL, then "chrome", "msedge".
 * Headed mode: E2E_HEADED=1.
 */
export async function launchBrowser() {
  fs.mkdirSync(OUT, { recursive: true });
  const headless = process.env.E2E_HEADED !== "1";

  const attempts = [];
  if (process.env.E2E_BROWSER_PATH) attempts.push({ executablePath: process.env.E2E_BROWSER_PATH });
  if (process.env.E2E_BROWSER_CHANNEL) attempts.push({ channel: process.env.E2E_BROWSER_CHANNEL });
  attempts.push({ channel: "chrome" }, { channel: "msedge" });

  const errors = [];
  for (const options of attempts) {
    try {
      return await chromium.launch({ ...options, headless });
    } catch (err) {
      errors.push(`${options.channel ?? options.executablePath}: ${String(err.message).split("\n")[0]}`);
    }
  }
  console.error(
    "E2E: could not start Chrome or Edge. Install one of them (the suite does not download a browser),\n" +
      "or point E2E_BROWSER_PATH at a Chromium-based browser executable.\n  " +
      errors.join("\n  "),
  );
  process.exit(2);
}
