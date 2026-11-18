// Browser e2e: responsive layout (390 px and 768 px), visible keyboard focus, the delete flow,
// page titles, favicon and the login copy.
import path from "node:path";
import { BASE, OUT, SEED, apiLogin, assertSafeTarget, createChecker, preflight, sleep } from "./lib/env.mjs";
import { launchBrowser } from "./lib/browser.mjs";

assertSafeTarget("Browser suite: responsive, focus, delete, titles");
await preflight();

const { check, report } = createChecker();
const W = SEED.welcome;
const C = SEED.carolPlan;
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
const consoleErrors = [];
const watch = (page, who) => {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${who}] ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${who}] pageerror: ${String(e).slice(0, 200)}`));
};

const browser = await launchBrowser();
async function newPage(width, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  watch(page, `w${width}`);
  return page;
}
async function loginViaUi(page, name) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
  await page.waitForURL("**/documents", { timeout: 15000 });
}

/** Anything that sticks out of the viewport horizontally (ignoring content inside scrollable boxes). */
function overflowReport(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 1 && r.left >= -1) continue;
      let p = el.parentElement;
      let scrolls = false;
      while (p && p !== document.body) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll" || o === "hidden") { scrolls = true; break; }
        p = p.parentElement;
      }
      if (!scrolls) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} (right=${Math.round(r.right)})`);
    }
    return { pageOverflow: document.documentElement.scrollWidth - vw, offenders: offenders.slice(0, 4) };
  });
}
async function expectNoOverflow(page, label) {
  const o = await overflowReport(page);
  check(`${label}: no horizontal overflow`, "0 / none", `${o.pageOverflow <= 0 ? 0 : o.pageOverflow} / ${o.offenders.length ? o.offenders.join(", ") : "none"}`);
}
const inViewport = (page, locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= -1 && r.right <= document.documentElement.clientWidth + 1;
  });

// A long title and a long-named document to stress the layouts.
const alice = await apiLogin("alice@example.com");
const LONG = "A very long document title that keeps going and going so that it must wrap or truncate rather than push the layout wider than the screen ".repeat(1).slice(0, 190);
const made = await (await fetch(`${BASE}/api/documents`, { method: "POST", headers: { Cookie: alice, "Content-Type": "application/json" }, body: JSON.stringify({ title: LONG }) })).json();
const LONG_ID = made.document.id;

// ============================= RESPONSIVE =============================
for (const width of [390, 768]) {
  const page = await newPage(width);
  const w = `${width}px`;

  // login (signed out)
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: /Continue as Alice/ }).waitFor();
  await expectNoOverflow(page, `login @${w}`);
  check(`login @${w}: all 3 user buttons fully visible`, "3/3", `${await page.getByRole("button", { name: /Continue as/ }).count()}/${(await Promise.all((await page.getByRole("button", { name: /Continue as/ }).all()).map((b) => inViewport(page, b)))).filter(Boolean).length}`);
  await shot(page, `20-login-${width}`);

  // list
  await loginViaUi(page, "Alice");
  await page.getByText("Welcome to Collab Docs").first().waitFor();
  await expectNoOverflow(page, `list @${w}`);
  check(`list @${w}: header controls, New document and Import all inside the screen`, true, (await Promise.all([page.getByRole("button", { name: "New document" }), page.getByRole("button", { name: "Import file" }), page.getByRole("button", { name: "Log out" }), page.getByLabel("Switch user")].map((l) => inViewport(page, l)))).every(Boolean));
  check(`list @${w}: the 190-character title is truncated inside its card`, true, await page.locator(`a[href="/documents/${LONG_ID}"] p.truncate`).evaluate((el) => el.scrollWidth > el.clientWidth && el.getBoundingClientRect().right <= document.documentElement.clientWidth));
  await shot(page, `21-list-${width}`, { fullPage: true });

  // editor (owner) with the long title
  await page.goto(`${BASE}/documents/${LONG_ID}`);
  await page.waitForSelector(".ProseMirror");
  await page.waitForFunction(() => [...document.querySelectorAll("[role=toolbar] button")].every((b) => !b.disabled));
  await expectNoOverflow(page, `editor (owner, long title) @${w}`);
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  check(`editor @${w}: toolbar wraps, all 7 buttons inside the screen`, "7/true", `${await toolbar.getByRole("button").count()}/${(await Promise.all((await toolbar.getByRole("button").all()).map((b) => inViewport(page, b)))).every(Boolean)}`);
  check(`editor @${w}: Share and Delete buttons inside the screen`, true, (await inViewport(page, page.getByRole("button", { name: "Share", exact: true }))) && (await inViewport(page, page.getByRole("button", { name: "Delete", exact: true }))));
  check(`editor @${w}: title field wide enough to use (>= 200 px)`, true, (await page.getByLabel("Document title").evaluate((el) => el.getBoundingClientRect().width)) >= 200);
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Typing on a small screen works.", { delay: 5 });
  check(`editor @${w}: typing works`, true, (await page.locator(".ProseMirror").innerText()).includes("small screen"));
  await shot(page, `22-editor-${width}`, { fullPage: true });

  // share dialog
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const share = page.getByRole("dialog", { name: "Share this document" });
  await share.getByLabel("Choose a person").waitFor();
  const sr = await share.evaluate((d) => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, vw: document.documentElement.clientWidth, vh: window.innerHeight }; });
  check(`share dialog @${w}: fits inside the screen`, true, sr.l >= 0 && sr.r <= sr.vw && sr.b <= sr.vh);
  check(`share dialog @${w}: Share button, email field and permission select reachable`, true, (await Promise.all([share.getByLabel("Email address"), share.getByLabel("Permission for the new person"), share.locator("button[type=submit]"), share.getByRole("button", { name: "Done" })].map((l) => inViewport(page, l)))).every(Boolean));
  await shot(page, `23-share-dialog-${width}`);
  await page.keyboard.press("Escape");

  // delete dialog
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const del = page.getByRole("dialog", { name: "Delete this document?" });
  await del.waitFor();
  const dr = await del.evaluate((d) => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, vw: document.documentElement.clientWidth }; });
  check(`delete dialog @${w}: fits inside the screen`, true, dr.l >= 0 && dr.r <= dr.vw);
  await shot(page, `24-delete-dialog-${width}`);
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/documents/${C}`);
  await page.waitForSelector(".ProseMirror");
  await expectNoOverflow(page, `editor (viewer) @${w}`);
  await shot(page, `25-viewer-${width}`, { fullPage: true });

  // not-found
  await page.goto(`${BASE}/documents/9d3c1f0a-6b1e-4c2f-8a55-0a1b2c3d4e5f`);
  await page.getByRole("heading", { name: "Document not found" }).waitFor();
  await expectNoOverflow(page, `not-found @${w}`);
  await page.context().close();
}

// ============================= FOCUS =============================
{
  const page = await newPage(1200);
  /** Presses Tab `n` times and returns, for each stop, what has focus and what its outline looks like. */
  async function tabStops(n) {
    const stops = [];
    for (let i = 0; i < n; i++) {
      await page.keyboard.press("Tab");
      stops.push(await page.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        return { name: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 28), tag: el.tagName.toLowerCase(), editor: el.classList.contains("ProseMirror"), style: cs.outlineStyle, width: cs.outlineWidth };
      }));
    }
    return stops;
  }
  const ringed = (stops) => stops.filter((s) => !s.editor).every((s) => s.style === "solid" && parseFloat(s.width) >= 2);

  await page.goto(`${BASE}/login`);
  let stops = await tabStops(3);
  check("focus: login buttons show a ring", true, ringed(stops));

  await loginViaUi(page, "Alice");
  await page.getByText("Welcome to Collab Docs").first().waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  stops = await tabStops(8);
  check(`focus: list page (header link, user select, Log out, Import, New document, cards) all show a ring`, true, ringed(stops));
  check("focus: the list page tab order reaches a document card", true, stops.some((s) => s.tag === "a" && /Welcome|plan/i.test(s.name)));

  await page.goto(`${BASE}/documents/${W}`);
  await page.waitForSelector(".ProseMirror");
  await page.waitForFunction(() => [...document.querySelectorAll("[role=toolbar] button")].every((b) => !b.disabled));
  await page.evaluate(() => document.activeElement?.blur());
  stops = await tabStops(13);
  check("focus: editor page (title input, Share, Delete, toolbar buttons, header) all show a ring", true, ringed(stops));
  check("focus: tab order includes the title input, Share, Delete and the toolbar", true, ["Document title", "Share", "Delete", "Bold", "Underline", "Heading 1", "Numbered list"].every((n) => stops.some((s) => s.name === n)));
  await page.close();
}

// ============================= DELETE =============================
{
  const page = await newPage(1200);
  watch(page, "delete");
  await loginViaUi(page, "Alice");
  await page.getByRole("button", { name: "New document" }).click();
  await page.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").pop();
  await page.waitForSelector(".ProseMirror");
  const delBtn = page.getByRole("button", { name: "Delete", exact: true });
  const dialog = page.getByRole("dialog", { name: "Delete this document?" });
  const active = () => page.evaluate(() => document.activeElement?.textContent?.trim());

  check("delete: owner sees Delete next to Share", true, (await delBtn.isVisible()) && (await page.getByRole("button", { name: "Share", exact: true }).isVisible()));
  await delBtn.click();
  await dialog.waitFor();
  check("delete: confirm dialog is labelled and focus starts on Cancel (the safe choice)", "Cancel", await active());
  check("delete: it warns the action cannot be undone", true, /can.t be\s+undone/.test(await dialog.innerText()));
  await shot(page, "26-delete-dialog-desktop");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check("delete: Esc closes it and focus returns to the Delete button", "Delete", await active());
  await delBtn.click(); await dialog.waitFor();
  let inside = true;
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); if (!(await dialog.evaluate((d) => d.contains(document.activeElement)))) inside = false; }
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Shift+Tab"); if (!(await dialog.evaluate((d) => d.contains(document.activeElement)))) inside = false; }
  check("delete: Tab / Shift+Tab stay inside the dialog", true, inside);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "hidden" });
  check("delete: Cancel keeps the document (API still returns it)", 200, await page.evaluate(async (i) => (await fetch(`/api/documents/${i}`)).status, id));
  check("delete: ...and focus returns to Delete", "Delete", await active());

  // failures first: 500 then 403 keep the dialog open with a readable message
  await page.route(`**/api/documents/${id}`, (route) => route.request().method() === "DELETE" ? route.fulfill({ status: 500, body: "{}" }) : route.continue());
  await delBtn.click(); await dialog.waitFor();
  await dialog.getByRole("button", { name: "Delete document" }).click();
  await dialog.getByRole("alert").waitFor();
  check("delete: a server error shows a friendly message and keeps the dialog open", "Couldn't delete the document. Please try again./true", `${await dialog.getByRole("alert").innerText()}/${await dialog.isVisible()}`);
  check("delete: buttons are usable again after the error", false, await dialog.getByRole("button", { name: "Delete document" }).isDisabled());
  await shot(page, "27-delete-error");
  await page.unroute(`**/api/documents/${id}`);

  // pending state: slow delete, dialog cannot be dismissed meanwhile
  await page.route(`**/api/documents/${id}`, async (route) => { if (route.request().method() === "DELETE") await sleep(900); await route.continue(); });
  await dialog.getByRole("button", { name: "Delete document" }).click();
  check("delete: while deleting the button says 'Deleting…' and both buttons are disabled", "Deleting…/true/true", `${(await dialog.getByRole("button", { name: /Deleting/ }).innerText()).trim()}/${await dialog.getByRole("button", { name: /Deleting/ }).isDisabled()}/${await dialog.getByRole("button", { name: "Cancel" }).isDisabled()}`);
  await page.keyboard.press("Escape");
  check("delete: Esc does not dismiss the dialog mid-request", true, await dialog.isVisible());
  await page.waitForURL("**/documents", { timeout: 15000 });
  await page.unroute(`**/api/documents/${id}`);
  check("delete: after confirming, we are on the list and the document is gone", "0/404", `${await page.locator(`a[href="/documents/${id}"]`).count()}/${await page.evaluate(async (i) => (await fetch(`/api/documents/${i}`)).status, id)}`);

  // only owners
  const bob = await newPage(1200); await loginViaUi(bob, "Bob");
  await bob.goto(`${BASE}/documents/${W}`); await bob.waitForSelector(".ProseMirror");
  check("delete: Bob (editor) has no Delete and no Share button", "0/0", `${await bob.getByRole("button", { name: "Delete", exact: true }).count()}/${await bob.getByRole("button", { name: "Share", exact: true }).count()}`);
  await page.goto(`${BASE}/documents/${C}`); await page.waitForSelector(".ProseMirror");
  check("delete: Alice (viewer on Carol's plan) has no Delete button", 0, await page.getByRole("button", { name: "Delete", exact: true }).count());
  await bob.context().close();
  await page.context().close();
}

// ============================= TITLES, FAVICON, COPY =============================
{
  const page = await newPage(1200);
  await page.goto(`${BASE}/login`);
  check("title: login", "Sign in · Collab Docs", await page.title());
  const text = await page.locator("main").innerText();
  check("login copy: says these are demo accounts with no password", true, /demo accounts/i.test(text) && /no\s+password/i.test(text));
  const icon = await page.locator('link[rel~="icon"]').first().getAttribute("href");
  const iconRes = await fetch(new URL(icon, BASE));
  check("favicon: a <link rel=icon> points at our SVG, which is served", "true/image/svg+xml", `${/icon\.svg/.test(icon)}/${(iconRes.headers.get("content-type") ?? "").split(";")[0]}`);
  await loginViaUi(page, "Alice");
  await page.waitForFunction(() => document.title.startsWith("Documents")); // the title is applied after navigation
  check("title: documents list", "Documents · Collab Docs", await page.title());
  await page.goto(`${BASE}/documents/${W}`);
  check("title: editor uses the document title", "Welcome to Collab Docs · Collab Docs", await page.title());
  await page.goto(`${BASE}/documents/9d3c1f0a-6b1e-4c2f-8a55-0a1b2c3d4e5f`);
  await page.getByRole("heading", { name: "Document not found" }).waitFor();
  check("title: not-found page", "Document not found · Collab Docs", await page.title());
  await page.context().close();
}

// clean up everything that is not part of the seed
const seed = new Set(Object.values(SEED));
const owned = (await (await fetch(`${BASE}/api/documents`, { headers: { Cookie: alice } })).json()).owned.map((d) => d.id);
for (const id of owned.filter((id) => !seed.has(id))) await fetch(`${BASE}/api/documents/${id}`, { method: "DELETE", headers: { Cookie: alice } });
check("cleanup: Alice owns only the seeded document again", 1, (await (await fetch(`${BASE}/api/documents`, { headers: { Cookie: alice } })).json()).owned.length);

const relevant = consoleErrors.filter((e) => !/Failed to load resource/.test(e));
check("console: no page errors / hydration warnings (excluding expected 4xx/5xx)", 0, relevant.length);
if (relevant.length) console.log("CONSOLE:\n" + relevant.join("\n"));

await browser.close();
process.exit(report("Browser suite: responsive, focus, delete, titles") ? 1 : 0);
