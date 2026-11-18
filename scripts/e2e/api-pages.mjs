// Page-level checks over HTTP: redirects, status codes (401/404 policy) and server-rendered content.
import { BASE, assertSafeTarget, preflight } from "./lib/env.mjs";

assertSafeTarget("API suite: pages");
await preflight();

const W = "a0000000-0000-4000-8000-000000000001"; // Welcome (alice owner, bob editor)
const BN = "a0000000-0000-4000-8000-000000000002"; // Bob's private notes
const C = "a0000000-0000-4000-8000-000000000003"; // Carol's plan (carol owner, alice viewer)

async function login(email) {
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  if (r.status !== 200) throw new Error("login failed " + email);
  return r.headers.getSetCookie()[0].split(";")[0];
}
async function get(path, cookie) {
  const r = await fetch(BASE + path, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  return { status: r.status, location: r.headers.get("location"), text: (await r.text()).replace(/<!-- -->/g, "") };
}
const rows = []; let fails = 0;
function check(label, expected, actual) { const ok = String(expected) === String(actual); if (!ok) fails++; rows.push(`| ${label} | ${expected} | ${actual} | ${ok ? "PASS" : "FAIL"} |`); }
const loc = (r) => `${r.status}${r.location ? " -> " + new URL(r.location, BASE).pathname : ""}`;

const alice = await login("alice@example.com"), bob = await login("bob@example.com");

check("signed out: /documents", "307 -> /login", loc(await get("/documents")));
check("signed out: /documents/<welcome>", "307 -> /login", loc(await get(`/documents/${W}`)));
check("signed out: /documents/not-a-uuid", "307 -> /login", loc(await get("/documents/not-a-uuid")));
check("tampered cookie: /documents", "307 -> /login", loc(await get("/documents", "collab_user_id=zzz")));
check("alice: /documents", 200, (await get("/documents", alice)).status);
check("alice: /documents/<welcome> (owner)", 200, (await get(`/documents/${W}`, alice)).status);
check("alice: /documents/<carol plan> (viewer)", 200, (await get(`/documents/${C}`, alice)).status);
check("bob: /documents/<welcome> (editor)", 200, (await get(`/documents/${W}`, bob)).status);
check("bob: /documents/<carol plan> (no access)", 404, (await get(`/documents/${C}`, bob)).status);
check("bob: random valid uuid (missing)", 404, (await get("/documents/9d3c1f0a-6b1e-4c2f-8a55-0a1b2c3d4e5f", bob)).status);
check("bob: /documents/not-a-uuid", 404, (await get("/documents/not-a-uuid", bob)).status);
check("alice: /documents/<bob's private notes>", 404, (await get(`/documents/${BN}`, alice)).status);

const nf = await get(`/documents/${C}`, bob);
check("404 page says 'Document not found'", true, /Document not found/.test(nf.text));
check("404 page does not leak the title", false, /project plan/i.test(nf.text));
check("404 response: server HTML is Next client-render shell (header appears after JS; checked in the browser suite)", false, /Switch user/.test(nf.text));

const list = (await get("/documents", alice)).text;
for (const [label, re] of [
  ["list: 'My documents' section", /My documents/], ["list: 'Shared with me' section", /Shared with me/],
  ["list: Welcome card", /Welcome to Collab Docs/], ["list: Carol's plan card (shared)", /project plan/],
  ["list: 'Shared · Viewer' badge", /Shared · Viewer|Shared &middot; Viewer/], ["list: 'Owner' badge", />Owner</],
  ["list: owner name shown", /Owner: Carol/], ["list: relative time shown", /Updated (just now|\d+ (minute|hour|day)s? ago|yesterday|last week|\d+ weeks ago|[A-Z][a-z]{2} \d)/],
  ["list: card links to the document", new RegExp(`href="/documents/${W}"`)], ["list: header has Log out", /Log out/],
  ["list: Import button is there and the limits are stated (file size and text size)", /Import file[\s\S]*up to 2 MB\. Very large text \(over about 1 MB\) is rejected/],
]) check(label, true, re.test(list));
check("list: does not show Bob's private notes to Alice", false, /Bob(&#x27;|')s meeting notes/.test(list));
const bobList = (await get("/documents", bob)).text;
check("bob list: Welcome card with 'Shared · Editor'", true, /Shared · Editor|Shared &middot; Editor/.test(bobList));
check("bob list: shows his private notes", true, /meeting notes/.test(bobList));

const viewerPage = (await get(`/documents/${C}`, alice)).text;
check("alice on Carol's plan: 'View only' badge", true, /View only/.test(viewerPage));
check("alice on Carol's plan: no formatting toolbar in HTML", false, /role="toolbar"/.test(viewerPage));
const editorPage = (await get(`/documents/${W}`, bob)).text;
check("bob on Welcome: <title> is the document title", true, /<title>Welcome to Collab Docs · Collab Docs<\/title>/.test(editorPage));
check("bob on Welcome: owner name shown", true, /Owner: Alice/.test(editorPage));
check("bob on Welcome: 'Editor' role badge", true, />Editor</.test(editorPage));

console.log("| Check | Expected | Actual | |\n|---|---|---|---|\n" + rows.join("\n"));
console.log(`\n${rows.length - fails}/${rows.length} passed`);
process.exit(fails ? 1 : 0);
