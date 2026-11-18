// Browser e2e (real Chrome/Edge via playwright-core): login, list, editor, formatting, autosave,
// rename, roles and the not-found / read-only states.
import { BASE, OUT, assertSafeTarget, preflight } from "./lib/env.mjs";
import { launchBrowser } from "./lib/browser.mjs";

assertSafeTarget("Browser suite: editor");
await preflight();
const W = "a0000000-0000-4000-8000-000000000001"; // Welcome: Alice owns, Bob is editor
const C = "a0000000-0000-4000-8000-000000000003"; // Carols plan: Alice is viewer

const rows = []; let fails = 0;
function check(label, expected, actual) {
  const ok = String(expected) === String(actual);
  if (!ok) fails++;
  rows.push(`| ${label} | ${expected} | ${actual} | ${ok ? "PASS" : "FAIL"} |`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
const consoleErrors = [];
function watch(page, who) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${who}] ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${who}] pageerror: ${String(e).slice(0, 200)}`));
}
const status = (page) => page.locator("[data-save-status]").getAttribute("data-save-status");
const waitStatus = (page, s, timeout = 8000) => page.waitForSelector(`[data-save-status="${s}"]`, { timeout });

async function loginViaUi(page, name) {
  await page.goto(BASE + "/login");
  await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
  await page.waitForURL("**/documents", { timeout: 15000 });
}

// ---------------------------------------------------------------------------
const aliceCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await aliceCtx.newPage(); watch(page, "alice");
const patches = []; // content PATCHes: { t0, t1, status }
page.on("request", (r) => { if (r.method() === "PATCH") r._t0 = Date.now(); });
page.on("requestfinished", async (r) => { if (r.method() === "PATCH") { const resp = await r.response(); patches.push({ t0: r._t0, t1: Date.now(), status: resp?.status(), body: r.postData() ?? "" }); } });

// A. login through the UI
await loginViaUi(page, "Alice");
check("A. login page -> /documents", "/documents", new URL(page.url()).pathname);
check("A. header shows app name link", true, await page.getByRole("link", { name: "Collab Docs", exact: true }).isVisible());
check("A. user switcher shows Alice", "Alice", await page.getByLabel("Switch user").evaluate((s) => s.options[s.selectedIndex].text));
check("A. user switcher lists 3 users", 3, await page.getByLabel("Switch user").locator("option").count());
check("A. 'My documents' + 'Shared with me' headings", true, (await page.getByRole("heading", { name: "My documents" }).isVisible()) && (await page.getByRole("heading", { name: "Shared with me" }).isVisible()));
const welcomeCard = page.locator(`a[href="/documents/${W}"]`);
check("A. Welcome card: owner badge + relative time", true, /Owner/.test(await welcomeCard.innerText()) && /Updated .+/.test(await welcomeCard.innerText()));
const carolCard = page.locator(`a[href="/documents/${C}"]`);
check("A. Carol's plan card: 'Shared · Viewer' + owner Carol", true, /Shared · Viewer/.test(await carolCard.innerText()) && /Owner: Carol/.test(await carolCard.innerText()));
check("A. Import button is enabled and states its limits", "false/true", `${await page.getByRole("button", { name: "Import file" }).isDisabled()}/${/up to 2 MB/.test(await page.locator("#import-help").innerText())}`);
await page.screenshot({ path: `${OUT}/01-list-alice.png` });

// B. create a document
const patchesBeforeCreate = patches.length;
await page.getByRole("button", { name: "New document" }).click();
await page.waitForURL(/\/documents\/[0-9a-f-]{36}$/, { timeout: 15000 });
const DOC = new URL(page.url()).pathname.split("/").pop();
await page.waitForSelector(".ProseMirror");
check("B. new document opens editor", "Untitled", await page.getByLabel("Document title").inputValue());
check("B. role badge + owner line", "Owner|Owned by you", `${await page.getByText("Owner", { exact: true }).first().innerText()}|${await page.getByText("Owned by you").innerText()}`);
check("B. toolbar has 7 formatting buttons", 7, await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button").count());
await sleep(1500);
check("B. NO save fired just by loading the editor", 0, patches.length - patchesBeforeCreate);
check("B. status 'saved' on load", "saved", await status(page));

const editor = page.locator(".ProseMirror");
const tb = page.getByRole("toolbar", { name: "Formatting" });
const pressed = async (name) => (await tb.getByRole("button", { name, exact: true }).getAttribute("aria-pressed"));
await editor.click();
await tb.getByRole("button", { name: "Heading 1" }).click();
check("B. H1 button shows pressed", "true", await pressed("Heading 1"));
await page.keyboard.type("Quarterly plan", { delay: 15 });
await page.keyboard.press("Enter");
await tb.getByRole("button", { name: "Heading 2" }).click();
await page.keyboard.type("Goals", { delay: 15 });
await page.keyboard.press("Enter");
await page.keyboard.type("Plain, ", { delay: 15 });
await page.keyboard.press("Control+b"); await page.keyboard.type("bold", { delay: 15 });
check("B. Ctrl+B toggles Bold (button pressed)", "true", await pressed("Bold"));
await page.keyboard.press("Control+b");
await page.keyboard.type(" ");
await page.keyboard.press("Control+i"); await page.keyboard.type("italic", { delay: 15 }); await page.keyboard.press("Control+i");
await page.keyboard.type(" ");
await page.keyboard.press("Control+u"); await page.keyboard.type("underlined", { delay: 15 });
check("B. Ctrl+U toggles Underline (button pressed)", "true", await pressed("Underline"));
await page.keyboard.press("Control+u");
check("B. Bold no longer pressed after toggling off", "false", await pressed("Bold"));
await page.keyboard.press("Enter");
await tb.getByRole("button", { name: "Bullet list" }).click();
check("B. Bullet list button pressed", "true", await pressed("Bullet list"));
await page.keyboard.type("first bullet", { delay: 15 }); await page.keyboard.press("Enter");
await page.keyboard.type("second bullet", { delay: 15 }); await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); // leave list
await tb.getByRole("button", { name: "Numbered list" }).click();
check("B. Numbered list button pressed", "true", await pressed("Numbered list"));
await page.keyboard.type("step one", { delay: 15 }); await page.keyboard.press("Enter");
await page.keyboard.type("step two", { delay: 15 });

// unsaved indicator + beforeunload while typing, then saved
check("B. status right after typing is 'unsaved' or 'saving'", true, ["unsaved", "saving"].includes(await status(page)));
const warnsWhenUnsaved = await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
check("B. beforeunload warns while there are unsaved changes", true, warnsWhenUnsaved);
await waitStatus(page, "saved");
check("B. status text becomes 'Saved'", "Saved", (await page.locator("[data-save-status]").innerText()).trim());
const warnsWhenSaved = await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
check("B. beforeunload does NOT warn once saved", false, warnsWhenSaved);
const typedPatches = patches.length - patchesBeforeCreate;
check("B. ~100 keystrokes were debounced into only a few PATCHes (<= 3)", true, typedPatches >= 1 && typedPatches <= 3);
check("B. no PATCH overlapped another (single in flight)", true, patches.every((p, i) => i === 0 || p.t0 >= patches[i - 1].t1 - 5));

// formatting is VISIBLE (computed styles)
const styles = await page.evaluate(() => {
  const q = (s) => document.querySelector(`.ProseMirror ${s}`);
  const cs = (el) => (el ? getComputedStyle(el) : null);
  return {
    h1: parseFloat(cs(q("h1")).fontSize), h2: parseFloat(cs(q("h2")).fontSize), p: parseFloat(cs(q("p")).fontSize),
    h1w: cs(q("h1")).fontWeight, strongW: cs(q("strong")).fontWeight, emStyle: cs(q("em")).fontStyle, uDeco: cs(q("u")).textDecorationLine,
    ulType: cs(q("ul")).listStyleType, ulPad: parseFloat(cs(q("ul")).paddingLeft), olType: cs(q("ol")).listStyleType, olPad: parseFloat(cs(q("ol")).paddingLeft),
    surface: getComputedStyle(document.querySelector(".ProseMirror").closest(".bg-white")).backgroundColor,
    maxW: Math.round(document.querySelector(".ProseMirror").closest("div.mx-auto").getBoundingClientRect().width),
  };
});
check("B. H1 larger than H2 larger than body text", true, styles.h1 > styles.h2 && styles.h2 > styles.p);
check("B. headings are bold", true, Number(styles.h1w) >= 600);
check("B. <strong> is bold / <em> italic / <u> underlined", "true/italic/underline", `${Number(styles.strongW) >= 700}/${styles.emStyle}/${styles.uDeco}`);
check("B. bullet list shows bullets (disc, indented)", "disc/true", `${styles.ulType}/${styles.ulPad > 10}`);
check("B. numbered list shows numbers (decimal, indented)", "decimal/true", `${styles.olType}/${styles.olPad > 10}`);
check("B. editor sits on a white page surface", "rgb(255, 255, 255)", styles.surface);
check("B. page column is centered and <= 768px wide (max-w-3xl)", true, styles.maxW <= 768);
await page.screenshot({ path: `${OUT}/02-editor-formatted.png`, fullPage: true });

// C. reload -> persistence
await page.reload(); await page.waitForSelector(".ProseMirror h1");
const html = await page.locator(".ProseMirror").innerHTML();
check("C. reload keeps heading 1/2, bold, italic, underline, bullet + numbered lists", "h1,h2,strong,em,u,ul,ol", ["h1", "h2", "strong", "em", "u", "ul", "ol"].filter((t) => new RegExp(`<${t}[ >]`).test(html)).join(","));
const txt = await page.locator(".ProseMirror").innerText();
check("C. reload keeps the text", true, ["Quarterly plan", "Goals", "bold", "italic", "underlined", "first bullet", "second bullet", "step one", "step two"].every((s) => txt.includes(s)));
check("C. a fresh load does not trigger a save", "saved", await status(page));

// D. rename
const title = page.getByLabel("Document title");
await title.click(); await title.fill("Alice's QA doc"); await title.press("Enter");
await page.waitForFunction(() => document.title.startsWith("Alice's QA doc"), null, { timeout: 8000 });
check("D. rename via Enter updates the browser tab title", "Alice's QA doc · Collab Docs", await page.title());
await page.reload();
check("D. renamed title persists after reload", "Alice's QA doc", await page.getByLabel("Document title").inputValue());
await title.click(); await title.fill("   "); await page.locator("body").click({ position: { x: 5, y: 400 } });
await page.waitForSelector("#title-error");
check("D. blank title: error shown and value reverted", "A title can't be empty.|Alice's QA doc", `${await page.locator("#title-error").innerText()}|${await title.inputValue()}`);
await title.fill("x".repeat(201)); await title.press("Enter");
await page.waitForSelector("#title-error");
check("D. 201-char title rejected client-side", true, /at most 200/.test(await page.locator("#title-error").innerText()));
check("D. ...and reverted", "Alice's QA doc", await title.inputValue());
await title.fill("Throwaway name"); await title.press("Escape");
check("D. Escape cancels editing", "Alice's QA doc", await title.inputValue());
await title.fill("Renamed on blur"); await page.locator("body").click({ position: { x: 5, y: 400 } });
await page.waitForFunction(() => document.title.startsWith("Renamed on blur"), null, { timeout: 8000 });
check("D. rename on blur saves", "Renamed on blur · Collab Docs", await page.title());
// title failure path
await page.route(`**/api/documents/${DOC}`, (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 500, body: "{}" }) : route.continue());
await title.fill("Will fail"); await title.press("Enter");
await page.waitForSelector("#title-error");
check("D. server error on rename: friendly message, no raw text, value reverted", "true/Renamed on blur", `${/Couldn't rename/.test(await page.locator("#title-error").innerText())}/${await title.inputValue()}`);
await page.unroute(`**/api/documents/${DOC}`);

// G. autosave failure + retry
await editor.click(); await page.keyboard.press("Control+End");
await page.route(`**/api/documents/${DOC}`, (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 500, body: "{}" }) : route.continue());
await page.keyboard.type(" EDIT-WHILE-FAILING", { delay: 10 });
await waitStatus(page, "error");
check("G. server error -> 'Couldn't save · Retry'", true, /Couldn.t save/.test(await page.locator("[data-save-status]").innerText()) && (await page.getByRole("button", { name: "Retry" }).isVisible()));
check("G. unsaved edits still warn on unload while in error", true, await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }));
await page.unroute(`**/api/documents/${DOC}`);
await page.getByRole("button", { name: "Retry" }).click();
await waitStatus(page, "saved");
check("G. Retry saves the edits -> 'Saved'", "saved", await status(page));
await page.reload(); await page.waitForSelector(".ProseMirror");
check("G. the edit made while failing was persisted after retry", true, (await page.locator(".ProseMirror").innerText()).includes("EDIT-WHILE-FAILING"));

// H. out-of-order protection: delay first request, keep typing
const before = patches.length;
let first = true, inflight = 0, maxInflight = 0, handled = 0;
await page.route(`**/api/documents/${DOC}`, async (route) => {
  if (route.request().method() !== "PATCH") return route.continue();
  inflight++; handled++; maxInflight = Math.max(maxInflight, inflight);
  if (first) { first = false; await sleep(1800); } // hold the first request while the user keeps typing
  const resp = await route.fetch();
  await route.fulfill({ response: resp });
  inflight--;
});
await editor.click(); await page.keyboard.press("Control+End");
await page.keyboard.type(" AAA", { delay: 10 });
await sleep(1000); // first PATCH is now in flight (delayed)
await page.keyboard.type(" BBB", { delay: 10 });
await sleep(1200);
await page.keyboard.type(" CCC", { delay: 10 });
await waitStatus(page, "saved", 15000);
await sleep(300);
const mine = patches.slice(before);
check("H. slow save: max PATCHes in progress at once (network layer)", 1, maxInflight);
check("H. slow save: typing during the held request produced exactly one follow-up (2 requests total)", 2, handled);
const lastBody = JSON.parse(mine.at(-1).body).content;
check("H. the LAST request carried the newest text (CCC)", true, JSON.stringify(lastBody).includes("CCC"));
await page.unroute(`**/api/documents/${DOC}`);
await page.reload(); await page.waitForSelector(".ProseMirror");
const finalText = await page.locator(".ProseMirror").innerText();
check("H. persisted text includes AAA, BBB and CCC", true, ["AAA", "BBB", "CCC"].every((s) => finalText.includes(s)));

// 401 / 403 / 404 handling (server-side responses faked on the client)
for (const [code, rx] of [[401, /session has ended/i], [403, /no longer have permission/i], [404, /no longer available/i]]) {
  await page.reload(); await page.waitForSelector(".ProseMirror");
  let n = 0;
  await page.route(`**/api/documents/${DOC}`, (route) => { if (route.request().method() === "PATCH") { n++; return route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify({ error: { code: "x", message: "m" } }) }); } return route.continue(); });
  await editor.click(); await page.keyboard.press("Control+End"); await page.keyboard.type(" z", { delay: 10 });
  await waitStatus(page, code === 401 ? "unauthorized" : "unavailable");
  const text = await page.locator("[data-save-status]").innerText();
  await page.keyboard.type(" more", { delay: 10 }); await sleep(1500);
  check(`${code}: clear message shown`, true, rx.test(text));
  check(`${code}: link offered (${code === 401 ? "/login" : "/documents"})`, true, (await page.locator("[data-save-status] a").getAttribute("href")) === (code === 401 ? "/login" : "/documents"));
  check(`${code}: autosave stopped (exactly 1 PATCH despite more typing)`, 1, n);
  await page.unroute(`**/api/documents/${DOC}`);
}

// I. Bob: shared editor doc is editable, Carol's plan is 404 (real browser)
await page.reload(); await page.waitForSelector(".ProseMirror");
await page.getByLabel("Switch user").selectOption({ label: "Bob" });
await page.waitForURL("**/documents"); await page.waitForSelector("text=Welcome to Collab Docs");
check("I. switched to Bob: switcher shows Bob", "Bob", await page.getByLabel("Switch user").evaluate((s) => s.options[s.selectedIndex].text));
check("I. Bob sees Welcome as 'Shared · Editor' and his own notes as Owner", true, /Shared · Editor/.test(await page.locator(`a[href="/documents/${W}"]`).innerText()) && (await page.getByText("Bob's meeting notes").isVisible()));
check("I. Bob does not see Alice's QA doc", 0, await page.locator(`a[href="/documents/${DOC}"]`).count());
await page.locator(`a[href="/documents/${W}"]`).click();
await page.waitForSelector(".ProseMirror");
check("I. Bob on Welcome: 'Editor' badge, toolbar present, contenteditable", "true/true/true", `${await page.getByText("Editor", { exact: true }).first().isVisible()}/${await page.getByRole("toolbar", { name: "Formatting" }).isVisible()}/${(await page.locator(".ProseMirror").getAttribute("contenteditable")) === "true"}`);
check("I. Bob (editor) can rename: title input is editable", true, await page.getByLabel("Document title").isEditable());
check("I. Bob sees 'Owner: Alice'", true, await page.getByText("Owner: Alice").isVisible());
await page.locator(".ProseMirror").click(); await page.keyboard.press("Control+End"); await page.keyboard.type(" (bob was here)", { delay: 10 });
await waitStatus(page, "saved");
const respCarol = await page.goto(BASE + `/documents/${C}`);
check("I. Bob -> Carol's plan: HTTP status", 404, respCarol.status());
await page.waitForSelector("text=Document not found", { timeout: 10000 });
check("I. Bob -> Carol's plan: not-found page rendered with the app header", "true/true", `${await page.getByRole("heading", { name: "Document not found" }).isVisible()}/${await page.getByLabel("Switch user").isVisible()}`);
check("I. not-found page leaks no title / content", false, /project plan|Milestones/i.test(await page.locator("body").innerText()));
await page.screenshot({ path: `${OUT}/03-not-found-bob.png` });
await page.getByRole("link", { name: "Back to documents" }).click();
await page.waitForURL("**/documents");
check("I. 'Back to documents' works", "/documents", new URL(page.url()).pathname);

// J. Alice on Carol's plan: read-only
await page.getByLabel("Switch user").selectOption({ label: "Alice" });
await page.waitForURL("**/documents"); await page.waitForSelector("text=Carol's project plan");
await page.locator(`a[href="/documents/${C}"]`).click();
await page.waitForSelector(".ProseMirror");
check("J. Alice on Carol's plan: 'View only' badge", true, await page.getByText("View only").isVisible());
check("J. no toolbar and no save status", "0/0", `${await page.getByRole("toolbar").count()}/${await page.locator("[data-save-status]").count()}`);
check("J. editor is not editable (contenteditable=false)", "false", await page.locator(".ProseMirror").getAttribute("contenteditable"));
check("J. title is plain text (no input)", "0", String(await page.getByLabel("Document title").count()));
check("J. owner shown", true, await page.getByText("Owner: Carol").isVisible());
const roBefore = await page.locator(".ProseMirror").innerText();
const patchesRO = patches.length;
await page.locator(".ProseMirror").click({ force: true }); await page.keyboard.type("HACK"); await sleep(1500);
check("J. typing does nothing and sends no request", "same/0", `${(await page.locator(".ProseMirror").innerText()) === roBefore ? "same" : "CHANGED"}/${patches.length - patchesRO}`);
check("J. read-only content still formatted (numbered list visible)", "decimal", await page.evaluate(() => getComputedStyle(document.querySelector(".ProseMirror ol")).listStyleType));
await page.screenshot({ path: `${OUT}/04-viewer-alice.png`, fullPage: true });

// K. logout + signed-out redirects
await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL("**/login");
check("K. Log out -> /login", "/login", new URL(page.url()).pathname);
await page.goto(BASE + "/documents");
check("K. /documents after logout redirects to /login", "/login", new URL(page.url()).pathname);
await page.goto(BASE + `/documents/${W}`);
check("K. /documents/[id] after logout redirects to /login", "/login", new URL(page.url()).pathname);

// L. revoked while editing (Bob edits Welcome; Alice removes his share through the API)
const bobCtx = await browser.newContext(); const bp = await bobCtx.newPage(); watch(bp, "bob");
await loginViaUi(bp, "Bob");
await bp.goto(BASE + `/documents/${W}`); await bp.waitForSelector(".ProseMirror");
const aliceApi = await (await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "alice@example.com" }) })).headers.getSetCookie()[0].split(";")[0];
const users = (await (await fetch(BASE + "/api/users", { headers: { Cookie: aliceApi } })).json()).users;
const bobId = users.find((u) => u.email === "bob@example.com").id;
const del = await fetch(BASE + `/api/documents/${W}/shares`, { method: "DELETE", headers: { Cookie: aliceApi, "Content-Type": "application/json" }, body: JSON.stringify({ userId: bobId }) });
check("L. (setup) Alice revoked Bob's share", 204, del.status);
await bp.locator(".ProseMirror").click(); await bp.keyboard.press("Control+End"); await bp.keyboard.type(" too late", { delay: 10 });
await waitStatus(bp, "unavailable");
check("L. revoked editor sees a clear message and autosave stops", true, /no longer (have permission|available)/i.test(await bp.locator("[data-save-status]").innerText()));
await bp.reload();
check("L. after revocation a reload shows the not-found page", true, await bp.getByRole("heading", { name: "Document not found" }).isVisible());
// restore the share
await fetch(BASE + `/api/documents/${W}/shares`, { method: "POST", headers: { Cookie: aliceApi, "Content-Type": "application/json" }, body: JSON.stringify({ email: "bob@example.com", permission: "editor" }) });

// M. unauthenticated browser
const anon = await browser.newContext(); const ap = await anon.newPage();
await ap.goto(BASE + "/documents"); check("M. fresh browser /documents -> /login", "/login", new URL(ap.url()).pathname);
await ap.goto(BASE + "/"); check("M. fresh browser / -> /login", "/login", new URL(ap.url()).pathname);

// cleanup + console
await fetch(BASE + `/api/documents/${DOC}`, { method: "DELETE", headers: { Cookie: aliceApi } });
const relevant = consoleErrors.filter((e) => !/Failed to load resource/.test(e));
check("console: no page errors / hydration warnings (excluding expected 4xx/5xx)", 0, relevant.length);
if (relevant.length) console.log("CONSOLE:\n" + relevant.join("\n"));

await browser.close();
console.log("| Check | Expected | Actual | |\n|---|---|---|---|\n" + rows.join("\n"));
console.log(`\n${rows.length - fails}/${rows.length} passed`);
process.exit(fails ? 1 : 0);
