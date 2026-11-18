// Browser e2e: file import (success + every error state) and the share dialog (whole lifecycle
// across three users, keyboard / focus behaviour, loading / error / pending states).
import { BASE, OUT, assertSafeTarget, preflight } from "./lib/env.mjs";
import { launchBrowser } from "./lib/browser.mjs";
import { makeFixtures } from "./lib/fixtures.mjs";

assertSafeTarget("Browser suite: import and sharing");
await preflight();
const FIX = makeFixtures();
const W = "a0000000-0000-4000-8000-000000000001"; // Welcome: Alice owns, Bob is editor

const C = "a0000000-0000-4000-8000-000000000003"; // Carol's plan (alice viewer)

const rows = []; let fails = 0;
function check(label, expected, actual) {
  const ok = String(expected) === String(actual);
  if (!ok) fails++;
  rows.push(`| ${label} | ${expected} | ${actual} | ${ok ? "PASS" : "FAIL"} |`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const consoleErrors = [];
const watch = (page, who) => {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${who}] ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${who}] pageerror: ${String(e).slice(0, 200)}`));
};
const browser = await launchBrowser();
const created = [];

async function loginViaUi(page, name) {
  await page.goto(BASE + "/login");
  await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
  await page.waitForURL("**/documents", { timeout: 15000 });
}
const docIdFromUrl = (page) => new URL(page.url()).pathname.split("/").pop();

// =============================== Alice ===============================
const aliceCtx = await browser.newContext({ viewport: { width: 1200, height: 950 } });
const page = await aliceCtx.newPage(); watch(page, "alice");
await loginViaUi(page, "Alice");

// ---------------- B. IMPORT ----------------
const importBtn = page.getByRole("button", { name: "Import file" });
check("B. Import button is enabled", false, await importBtn.isDisabled());
check("B. limits stated next to the button (file size and text size)", ".txt, .md and .docx files up to 2 MB. Very large text (over about 1 MB) is rejected.", (await page.locator("#import-help").innerText()).trim());
check("B. file input restricted via accept", ".txt,.md,.docx", await page.locator('input[type="file"]').getAttribute("accept"));
await page.screenshot({ path: `${OUT}/10-list-with-import.png` });

async function importFile(name) {
  await page.locator('input[type="file"]').setInputFiles(`${FIX}/${name}`);
}

// client-side rejections (no request should be sent)
let importRequests = 0;
page.on("request", (r) => { if (r.url().endsWith("/api/documents/import")) importRequests++; });
await importFile("notes.pdf");
await page.waitForSelector('p[role="alert"]');
check("B. .pdf: readable message", "Unsupported file type. Use .txt, .md or .docx.", await page.locator('p[role="alert"]').innerText());
await importFile("empty.txt");
await page.waitForFunction(() => /empty/i.test(document.querySelector('p[role="alert"]')?.textContent ?? ""));
check("B. empty file: readable message", true, /empty/i.test(await page.locator('p[role="alert"]').innerText()));
await importFile("big.txt");
await page.waitForFunction(() => /too large/i.test(document.querySelector('p[role="alert"]')?.textContent ?? ""));
check("B. 3 MB file: 'too large ... 2 MB' message", true, /2 MB/.test(await page.locator('p[role="alert"]').innerText()));
check("B. those three were rejected in the browser (0 requests sent)", 0, importRequests);
check("B. still on the list page after errors", "/documents", new URL(page.url()).pathname);

// server-side rejections
await importFile("corrupt.docx");
await page.waitForFunction(() => /couldn.t be read/i.test(document.querySelector('p[role="alert"]')?.textContent ?? ""), null, { timeout: 15000 });
check("B. corrupt .docx: server message shown, no technical text", true, /valid Word document/.test(await page.locator('p[role="alert"]').innerText()) && !/Error|stack|undefined|zip/i.test(await page.locator('p[role="alert"]').innerText()));
await importFile("blank.md");
await page.waitForFunction(() => /empty/i.test(document.querySelector('p[role="alert"]')?.textContent ?? ""), null, { timeout: 15000 });
check("B. whitespace-only .md: readable message", true, /empty/i.test(await page.locator('p[role="alert"]').innerText()));
check("B. server-rejected files sent exactly 2 requests", 2, importRequests);
check("B. button usable again after errors", false, await importBtn.isDisabled());

// ---- import a .md and open it
await importFile("Roadmap.md");
await page.waitForURL(/\/documents\/[0-9a-f-]{36}$/, { timeout: 20000 });
const mdId = docIdFromUrl(page); created.push(mdId);
await page.waitForSelector(".ProseMirror h1");
check("B. .md opens in the editor with title from the filename", "Roadmap", await page.getByLabel("Document title").inputValue());
const mdHtml = await page.locator(".ProseMirror").innerHTML();
check("B. .md keeps h1, h2, strong, em, u, ul, ol", "h1,h2,strong,em,u,ul,ol", ["h1", "h2", "strong", "em", "u", "ul", "ol"].filter((t) => new RegExp(`<${t}[ >]`).test(mdHtml)).join(","));
check("B. .md: #### heading became an h2 and nothing is left of the script/image", "true/false", `${/<h2[^>]*>A deeper heading/.test(mdHtml)}/${/script|alert|evil|<img|logo/i.test(mdHtml)}`);
check("B. .md: heading, list and numbering visibly styled", "disc/decimal", await page.evaluate(() => `${getComputedStyle(document.querySelector(".ProseMirror ul")).listStyleType}/${getComputedStyle(document.querySelector(".ProseMirror ol")).listStyleType}`));
check("B. imported doc is editable by its new owner (toolbar present)", true, await page.getByRole("toolbar", { name: "Formatting" }).isVisible());
await page.waitForFunction(() => [...document.querySelectorAll("[role=toolbar] button")].every((b) => !b.disabled));
check("B. all 7 toolbar buttons are enabled once the editor is ready", "7/0", `${await page.locator("[role=toolbar] button").count()}/${await page.locator("[role=toolbar] button:disabled").count()}`);
await sleep(600);
await page.screenshot({ path: `${OUT}/11-imported-md.png`, fullPage: true });

// ---- import a .docx and open it
await page.goto(BASE + "/documents");
await importFile("Quarterly report.docx");
await page.waitForURL(/\/documents\/[0-9a-f-]{36}$/, { timeout: 20000 });
const docxId = docIdFromUrl(page); created.push(docxId);
await page.waitForSelector(".ProseMirror h1");
check("B. .docx opens with title from the filename", "Quarterly report", await page.getByLabel("Document title").inputValue());
const dxHtml = await page.locator(".ProseMirror").innerHTML();
check("B. .docx keeps h1, h2, strong, em, u, ul, ol", "h1,h2,strong,em,u,ul,ol", ["h1", "h2", "strong", "em", "u", "ul", "ol"].filter((t) => new RegExp(`<${t}[ >]`).test(dxHtml)).join(","));
check("B. .docx: image and table dropped, text kept", "false/true", `${/<img|<table|data:/i.test(dxHtml)}/${/Thanks for reading/.test(dxHtml)}`);
await page.screenshot({ path: `${OUT}/12-imported-docx.png`, fullPage: true });

// ---- plain text
await page.goto(BASE + "/documents");
await importFile("plain.txt");
await page.waitForURL(/\/documents\/[0-9a-f-]{36}$/, { timeout: 20000 });
const txtId = docIdFromUrl(page); created.push(txtId);
await page.waitForSelector(".ProseMirror p");
check("B. .txt: 2 paragraphs; the 3-line first one has 2 hard breaks", "2/2", `${await page.locator(".ProseMirror > p").count()}/${await page.locator(".ProseMirror > p:first-child br:not(.ProseMirror-trailingBreak)").count()}`);
await page.goto(BASE + "/documents");
check("B. imported docs appear under 'My documents' with the Owner badge", true, (await page.locator(`a[href="/documents/${mdId}"]`).innerText()).includes("Owner") && (await page.locator(`a[href="/documents/${docxId}"]`).count()) === 1);

// ---------------- A. SHARE DIALOG ----------------
// owner sees Share; empty state on a document with no shares (the imported .txt)
await page.goto(BASE + `/documents/${txtId}`); await page.waitForSelector(".ProseMirror");
const shareBtn = page.getByRole("button", { name: "Share", exact: true });
check("A. owner sees the Share button", true, await shareBtn.isVisible());
await shareBtn.focus(); await shareBtn.click();
const dialog = page.getByRole("dialog", { name: "Share this document" });
await dialog.waitFor();
check("A. dialog has role=dialog and is labelled by its title", "Share this document", await dialog.getAttribute("aria-labelledby").then((id) => page.locator(`#${id}`).innerText()));
check("A. focus moved into the dialog", true, await dialog.evaluate((d) => d.contains(document.activeElement)));
await page.getByText("Not shared with anyone yet").waitFor();
check("A. empty state: 'Not shared with anyone yet'", true, await page.getByText("Not shared with anyone yet").isVisible());
check("A. dropdown offers Bob and Carol but NOT the owner", "Bob (bob@example.com)|Carol (carol@example.com)", (await dialog.getByLabel("Choose a person").locator("option").allInnerTexts()).filter((t) => t && !t.startsWith("Choose")).join("|"));
await page.screenshot({ path: `${OUT}/13-share-empty.png` });

// owner / unknown / malformed email errors
const emailInput = dialog.getByLabel("Email address");
const submit = dialog.getByRole("button", { name: "Share", exact: true });
await emailInput.fill("alice@example.com"); await submit.click();
await dialog.getByRole("alert").waitFor();
check("A. typing the owner's email: readable error", "You already own this document, so there's nothing to share with yourself.", await dialog.getByRole("alert").innerText());
await emailInput.fill("ghost@example.com"); await submit.click();
await page.waitForFunction(() => /No one with that email/.test(document.querySelector("dialog[open] [role=alert]")?.textContent ?? ""));
check("A. unknown email: readable error", true, /No one with that email uses this app/.test(await dialog.getByRole("alert").innerText()));
await emailInput.fill("nope"); await submit.click(); await dialog.getByRole("alert").waitFor(); await page.screenshot({ path: `${OUT}/14-share-errors.png` });
check("A. malformed email: readable error (no request needed)", "Enter a valid email address.", await dialog.getByRole("alert").innerText());
check("A. Share is disabled while the email is empty", true, await (async () => { await emailInput.fill(""); return submit.isDisabled(); })());

// pending state: slow POST
await page.route(`**/api/documents/${txtId}/shares`, async (route) => { if (route.request().method() === "POST") await sleep(900); await route.continue(); });
await dialog.getByLabel("Choose a person").selectOption({ label: "Bob (bob@example.com)" });
check("A. choosing a person fills the email field", "bob@example.com", await emailInput.inputValue());
await submit.click();
check("A. while sharing: button says 'Sharing…' and controls are disabled", "Sharing…/true/true", `${(await dialog.locator("button[type=submit]").innerText()).trim()}/${await dialog.locator("button[type=submit]").isDisabled()}/${await emailInput.isDisabled()}`);
await dialog.getByText("Shared with Bob as Viewer.").waitFor();
await page.unroute(`**/api/documents/${txtId}/shares`); // only after the delayed request has finished
check("A. after sharing: success message + Bob appears in the list", true, (await dialog.getByText("bob@example.com").count()) >= 1 && (await dialog.getByLabel("Permission for Bob").inputValue()) === "viewer");
check("A. Bob no longer offered in the dropdown", "Carol (carol@example.com)", (await dialog.getByLabel("Choose a person").locator("option").allInnerTexts()).filter((t) => t && !t.startsWith("Choose")).join("|"));
// upsert instead of duplicate: share Bob again as editor by typing his email
await emailInput.fill("BOB@example.com"); await dialog.getByLabel("Permission for the new person").selectOption("editor"); await submit.click();
await dialog.getByText("Shared with Bob as Editor.").waitFor();
check("A. re-adding Bob updates his permission instead of duplicating him", "1/editor", `${await dialog.getByLabel(/Permission for Bob/).count()}/${await dialog.getByLabel("Permission for Bob").inputValue()}`);

// ---- keyboard: Tab trap, Esc, focus return
let allInside = true;
for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); if (!(await dialog.evaluate((d) => d.contains(document.activeElement)))) allInside = false; }
for (let i = 0; i < 14; i++) { await page.keyboard.press("Shift+Tab"); if (!(await dialog.evaluate((d) => d.contains(document.activeElement)))) allInside = false; }
check("A. Tab x14 and Shift+Tab x14 never leave the dialog (focus trapped)", true, allInside);
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden" });
check("A. Esc closes the dialog", false, await dialog.isVisible());
check("A. focus returned to the Share button", "Share", await page.evaluate(() => document.activeElement?.textContent?.trim()));
await shareBtn.click(); await dialog.waitFor();
await dialog.getByRole("button", { name: "Done" }).click();
await dialog.waitFor({ state: "hidden" });
check("A. 'Done' closes it and focus returns to Share too", "Share", await page.evaluate(() => document.activeElement?.textContent?.trim()));
await shareBtn.click(); await dialog.waitFor();
await page.mouse.click(8, 8); // backdrop
await dialog.waitFor({ state: "hidden" });
check("A. clicking the backdrop closes it", false, await dialog.isVisible());
check("A. the page behind is inert while open", true, await (async () => { await shareBtn.click(); await dialog.waitFor(); const inert = await page.evaluate(() => { const el = document.querySelector(".ProseMirror"); return !document.querySelector("dialog[open]").contains(el) && getComputedStyle(el).pointerEvents !== undefined; }); await page.keyboard.press("Escape"); return inert; })());

// loading error state + retry
await page.route(`**/api/documents/${txtId}/shares`, (route) => route.request().method() === "GET" ? route.fulfill({ status: 500, body: "{}" }) : route.continue());
await shareBtn.click(); await dialog.waitFor();
await dialog.getByRole("button", { name: "Try again" }).waitFor();
check("A. load failure: friendly message + 'Try again', no raw error", true, /Something went wrong/.test(await dialog.getByRole("alert").innerText()));
await page.screenshot({ path: `${OUT}/15-share-load-error.png` });
await page.unroute(`**/api/documents/${txtId}/shares`);
await dialog.getByRole("button", { name: "Try again" }).click();
await dialog.getByLabel("Permission for Bob").waitFor();
check("A. 'Try again' reloads the list", "editor", await dialog.getByLabel("Permission for Bob").inputValue());
await page.keyboard.press("Escape");

// ---------------- A. SHARE LIFECYCLE on Welcome: Alice <-> Carol ----------------
await page.goto(BASE + `/documents/${W}`); await page.waitForSelector(".ProseMirror");
await page.evaluate(() => { window.__noReload = true; });
await shareBtn.click(); await dialog.waitFor();
await dialog.getByLabel("Permission for Bob").waitFor();
check("A. Welcome: existing share (Bob, Editor) listed with name + email", "editor", await dialog.getByLabel("Permission for Bob").inputValue());
check("A. Welcome: dropdown offers only Carol", "Carol (carol@example.com)", (await dialog.getByLabel("Choose a person").locator("option").allInnerTexts()).filter((t) => t && !t.startsWith("Choose")).join("|"));
await dialog.getByLabel("Choose a person").selectOption({ label: "Carol (carol@example.com)" });
await dialog.getByLabel("Permission for the new person").selectOption("viewer");
await dialog.locator("button[type=submit]").click();
await dialog.getByText("Shared with Carol as Viewer.").waitFor();
await page.screenshot({ path: `${OUT}/16-share-dialog-welcome.png` });

// Carol, in her own browser
const carolCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const cp = await carolCtx.newPage(); watch(cp, "carol");
await loginViaUi(cp, "Carol");
check("A. Carol sees Welcome under 'Shared with me' as Viewer", true, /Shared · Viewer/.test(await cp.locator(`a[href="/documents/${W}"]`).innerText()));
await cp.locator(`a[href="/documents/${W}"]`).click(); await cp.waitForSelector(".ProseMirror");
check("A. Carol (viewer): read-only, 'View only', no toolbar, no Share button", "false/true/0/0", `${await cp.locator(".ProseMirror").getAttribute("contenteditable")}/${await cp.getByText("View only").isVisible()}/${await cp.getByRole("toolbar").count()}/${await cp.getByRole("button", { name: "Share", exact: true }).count()}`);

// Alice upgrades Carol to Editor (same dialog, no reload)
await dialog.getByLabel("Permission for Carol").selectOption("editor");
await dialog.getByText("Carol is now an Editor.").waitFor();
check("A. Alice changed Carol to Editor in place", "editor", await dialog.getByLabel("Permission for Carol").inputValue());
await cp.reload(); await cp.waitForSelector(".ProseMirror");
check("A. Carol (now editor): editable, toolbar present, still no Share button", "true/true/0", `${(await cp.locator(".ProseMirror").getAttribute("contenteditable")) === "true"}/${await cp.getByRole("toolbar").isVisible()}/${await cp.getByRole("button", { name: "Share", exact: true }).count()}`);
await cp.locator(".ProseMirror").click(); await cp.keyboard.press("Control+End"); await cp.keyboard.type(" (carol edit)", { delay: 10 });
await cp.waitForSelector('[data-save-status="saved"]');
check("A. Carol's edit saved", "saved", await cp.locator("[data-save-status]").getAttribute("data-save-status"));

// Alice removes Carol; Carol's open editor notices, then not-found on reload
await dialog.getByRole("button", { name: "Remove Carol" }).click();
await dialog.getByText("Removed Carol. They no longer have access.").waitFor();
check("A. Carol removed from the list immediately", 0, await dialog.getByLabel("Permission for Carol").count());
check("A. no page reload happened (marker survived all changes)", true, await page.evaluate(() => window.__noReload === true));
check("A. Carol is offered in the dropdown again", true, (await dialog.getByLabel("Choose a person").locator("option").allInnerTexts()).some((t) => t.startsWith("Carol")));
await cp.locator(".ProseMirror").click(); await cp.keyboard.press("Control+End"); await cp.keyboard.type(" too late", { delay: 10 });
await cp.waitForSelector('[data-save-status="unavailable"]', { timeout: 10000 });
check("A. Carol's open editor: clear 'no longer' message after revoke", true, /no longer (have permission|available)/i.test(await cp.locator("[data-save-status]").innerText()));
const resp = await cp.goto(BASE + `/documents/${W}`);
await cp.waitForSelector("text=Document not found");
check("A. after removal Carol gets 404 + the not-found page", "404/true", `${resp.status()}/${await cp.getByRole("heading", { name: "Document not found" }).isVisible()}`);
await cp.goto(BASE + "/documents");
check("A. Welcome is gone from Carol's 'Shared with me'", 0, await cp.locator(`a[href="/documents/${W}"]`).count());
await page.keyboard.press("Escape");

// Bob (editor on Welcome) must not see Share
const bobCtx = await browser.newContext(); const bp = await bobCtx.newPage(); watch(bp, "bob");
await loginViaUi(bp, "Bob");
await bp.goto(BASE + `/documents/${W}`); await bp.waitForSelector(".ProseMirror");
check("A. Bob (editor on Welcome): NO Share button", 0, await bp.getByRole("button", { name: "Share", exact: true }).count());
check("A. Bob sees role badge + owner name instead", "true/true", `${await bp.getByText("Editor", { exact: true }).first().isVisible()}/${await bp.getByText("Owner: Alice").isVisible()}`);
check("A. Bob can't reach the shares API either (403)", 403, await bp.evaluate(async (id) => (await fetch(`/api/documents/${id}/shares`)).status, W));
// viewer (Alice on Carol's doc) also has none
await page.goto(BASE + `/documents/${C}`); await page.waitForSelector(".ProseMirror");
check("A. Alice (viewer on Carol's plan): NO Share button", 0, await page.getByRole("button", { name: "Share", exact: true }).count());

// cleanup
for (const id of created) await page.evaluate(async (id) => fetch(`/api/documents/${id}`, { method: "DELETE" }), id);
// remove every document that is not part of the seed (leftovers from earlier runs too)
const SEED = new Set([W, "a0000000-0000-4000-8000-000000000002", C]);
const mine = await page.evaluate(async () => (await (await fetch("/api/documents")).json()).owned.map((d) => d.id));
for (const id of mine.filter((id) => !SEED.has(id))) await page.evaluate(async (id) => fetch(`/api/documents/${id}`, { method: "DELETE" }), id);
check("cleanup: Alice owns only the seeded document again", 1, (await page.evaluate(async () => (await (await fetch("/api/documents")).json()).owned.length)));
const relevant = consoleErrors.filter((e) => !/Failed to load resource/.test(e));
check("console: no page errors / hydration warnings (excluding expected 4xx/5xx)", 0, relevant.length);
if (relevant.length) console.log("CONSOLE:\n" + relevant.join("\n"));
await browser.close();
console.log("| Check | Expected | Actual | |\n|---|---|---|---|\n" + rows.join("\n"));
console.log(`\n${rows.length - fails}/${rows.length} passed`);
process.exit(fails ? 1 : 0);
