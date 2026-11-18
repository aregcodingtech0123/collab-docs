// API e2e: auth, documents, shares, permissions and input validation.
// Needs a running server and a seeded database (see README, "Running the e2e suites").
import { BASE, assertSafeTarget, preflight } from "./lib/env.mjs";

assertSafeTarget("API suite: auth, documents, shares");
await preflight();


class Client {
  constructor(name) { this.name = name; this.cookie = null; this.setCookieRaw = null; }
  async req(method, path, body, { raw = false, cookie } = {}) {
    const headers = {};
    const c = cookie !== undefined ? cookie : this.cookie;
    if (c) headers.Cookie = c;
    let payload;
    if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = raw ? body : JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) this.setCookieRaw = sc[0];
    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json, setCookie: sc[0] ?? null, text };
  }
  async login(email) {
    const r = await this.req("POST", "/api/auth/login", { email });
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status}`);
    this.cookie = r.setCookie.split(";")[0];
    return r;
  }
}

const rows = [];
let failures = 0;
function check(label, expected, actual, ok = String(expected) === String(actual)) {
  rows.push({ label, expected: String(expected), actual: String(actual), ok });
  if (!ok) failures++;
}
const eq = (label, expected, actual) => check(label, expected, actual);

const anon = new Client("anon"), alice = new Client("alice"), bob = new Client("bob"), carol = new Client("carol");

// ---- unauthenticated ----
eq("unauthenticated GET /api/documents", 401, (await anon.req("GET", "/api/documents")).status);
eq("unauthenticated GET /api/users", 401, (await anon.req("GET", "/api/users")).status);
eq("unauthenticated GET /api/auth/me", 401, (await anon.req("GET", "/api/auth/me")).status);
eq("unauthenticated POST /api/documents", 401, (await anon.req("POST", "/api/documents", {})).status);
eq("tampered cookie (not a uuid) -> 401", 401, (await anon.req("GET", "/api/auth/me", undefined, { cookie: "collab_user_id=1; DROP TABLE users" })).status);
eq("cookie with unknown uuid -> 401", 401, (await anon.req("GET", "/api/auth/me", undefined, { cookie: "collab_user_id=11111111-1111-4111-8111-111111111111" })).status);

// ---- login ----
eq("login unknown email", 404, (await anon.req("POST", "/api/auth/login", { email: "nobody@example.com" })).status);
eq("login malformed JSON", 400, (await anon.req("POST", "/api/auth/login", "{nope", { raw: true })).status);
eq("login invalid email", 400, (await anon.req("POST", "/api/auth/login", { email: "nope" })).status);
const aliceLogin = await alice.login("ALICE@example.com "); // normalised
eq("login alice (email normalised)", 200, aliceLogin.status);
const flags = aliceLogin.setCookie.toLowerCase();
check("session cookie flags", "httponly, samesite=lax, path=/, max-age=604800",
  [flags.includes("httponly") && "httponly", flags.includes("samesite=lax") && "samesite=lax", flags.includes("path=/") && "path=/", flags.includes("max-age=604800") && "max-age=604800"].filter(Boolean).join(", "));
check("cookie Secure flag (expected only when NODE_ENV=production)", "secure present under next start", flags.includes("secure") ? "secure present under next start" : "secure absent");
await bob.login("bob@example.com");
await carol.login("carol@example.com");
const me = await alice.req("GET", "/api/auth/me");
eq("GET /api/auth/me as alice", "Alice", me.json?.user?.name);
const users = await alice.req("GET", "/api/users");
eq("GET /api/users returns 3 seeded users", true, users.json?.users?.length >= 3);
const U = Object.fromEntries(users.json.users.map((u) => [u.email, u]));

// ---- listing ----
const aList = (await alice.req("GET", "/api/documents")).json;
const bList = (await bob.req("GET", "/api/documents")).json;
const welcomeA = aList.owned.find((d) => d.title === "Welcome to Collab Docs");
const welcomeB = bList.shared.find((d) => d.title === "Welcome to Collab Docs");
eq("alice sees Welcome as owned, role", "owner", welcomeA?.role);
eq("bob sees Welcome as shared, role", "editor", welcomeB?.role);
eq("bob does not list Welcome as owned", false, bList.owned.some((d) => d.title === "Welcome to Collab Docs"));
const carolPlanA = aList.shared.find((d) => d.title === "Carol's project plan");
eq("alice sees Carol's plan as shared, role", "viewer", carolPlanA?.role);
check("list items have no content, include owner {id,name}", "true", String(!("content" in welcomeA) && welcomeA.owner?.name === "Alice" && !!welcomeA.updatedAt));
const sortedDesc = (arr) => arr.every((d, i) => i === 0 || new Date(arr[i - 1].updatedAt) >= new Date(d.updatedAt));
eq("owned/shared lists sorted by updatedAt desc", true, sortedDesc(aList.owned) && sortedDesc(aList.shared) && sortedDesc(bList.owned));
eq("alice cannot see Bob's private notes in any list", false, [...aList.owned, ...aList.shared].some((d) => d.title === "Bob's meeting notes"));

// ---- welcome doc: bob is editor ----
const W = welcomeA.id;
const newDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "edited by bob" }] }] };
const origWelcome = (await alice.req("GET", `/api/documents/${W}`)).json;
eq("alice GET Welcome -> role owner + content", "owner/doc", `${origWelcome.role}/${origWelcome.document.content.type}`);
const bobPatch = await bob.req("PATCH", `/api/documents/${W}`, { title: "  Welcome (edited by Bob)  ", content: newDoc });
eq("bob (editor) PATCH Welcome", 200, bobPatch.status);
const afterPatch = (await alice.req("GET", `/api/documents/${W}`)).json;
eq("PATCH persisted: trimmed title", "Welcome (edited by Bob)", afterPatch.document.title);
eq("PATCH persisted: content", "edited by bob", afterPatch.document.content.content[0].content[0].text);
check("PATCH bumped updatedAt", "true", String(new Date(afterPatch.document.updatedAt) > new Date(origWelcome.document.updatedAt)));
eq("bob list: edited doc now first in shared", W, (await bob.req("GET", "/api/documents")).json.shared[0].id);
eq("bob (editor) DELETE Welcome", 403, (await bob.req("DELETE", `/api/documents/${W}`)).status);
eq("bob (editor) POST share on Welcome", 403, (await bob.req("POST", `/api/documents/${W}/shares`, { email: "carol@example.com", permission: "viewer" })).status);
eq("bob (editor) GET shares on Welcome", 403, (await bob.req("GET", `/api/documents/${W}/shares`)).status);
eq("bob (editor) DELETE share on Welcome", 403, (await bob.req("DELETE", `/api/documents/${W}/shares`, { userId: U["bob@example.com"].id })).status);
eq("Welcome still exists after bob's DELETE attempt", 200, (await alice.req("GET", `/api/documents/${W}`)).status);

// ---- carol's doc: alice viewer, bob nothing ----
const C = carolPlanA.id;
const aGetC = await alice.req("GET", `/api/documents/${C}`);
eq("alice (viewer) GET Carol's plan", "200/viewer", `${aGetC.status}/${aGetC.json?.role}`);
eq("alice (viewer) PATCH Carol's plan", 403, (await alice.req("PATCH", `/api/documents/${C}`, { title: "hacked" })).status);
eq("alice (viewer) DELETE Carol's plan", 403, (await alice.req("DELETE", `/api/documents/${C}`)).status);
eq("alice (viewer) POST share on Carol's plan", 403, (await alice.req("POST", `/api/documents/${C}/shares`, { email: "bob@example.com", permission: "viewer" })).status);
eq("bob (no access) GET Carol's plan", 404, (await bob.req("GET", `/api/documents/${C}`)).status);
eq("bob (no access) PATCH Carol's plan", 404, (await bob.req("PATCH", `/api/documents/${C}`, { title: "x" })).status);
eq("bob (no access) DELETE Carol's plan", 404, (await bob.req("DELETE", `/api/documents/${C}`)).status);
eq("bob (no access) GET shares of Carol's plan", 404, (await bob.req("GET", `/api/documents/${C}/shares`)).status);
const b404 = (await bob.req("GET", `/api/documents/${C}`)).json;
const missing = (await bob.req("GET", `/api/documents/9d3c1f0a-6b1e-4c2f-8a55-0a1b2c3d4e5f`)).json;
eq("404 for no-access is indistinguishable from missing doc", JSON.stringify(missing), JSON.stringify(b404));
eq("carol (owner) title unchanged", "Carol's project plan", (await carol.req("GET", `/api/documents/${C}`)).json.document.title);

// ---- shares (alice owns Welcome) ----
eq("owner alice GET shares", "bob@example.com:editor", (await alice.req("GET", `/api/documents/${W}/shares`)).json.shares.map((s) => `${s.user.email}:${s.permission}`).join(","));
eq("share with unknown email", 404, (await alice.req("POST", `/api/documents/${W}/shares`, { email: "ghost@example.com", permission: "viewer" })).status);
eq("share with yourself", 400, (await alice.req("POST", `/api/documents/${W}/shares`, { email: "alice@example.com", permission: "viewer" })).status);
eq("share with invalid permission", 400, (await alice.req("POST", `/api/documents/${W}/shares`, { email: "carol@example.com", permission: "admin" })).status);
eq("share with owner-level permission", 400, (await alice.req("POST", `/api/documents/${W}/shares`, { email: "carol@example.com", permission: "owner" })).status);
eq("share with malformed JSON", 400, (await alice.req("POST", `/api/documents/${W}/shares`, "{", { raw: true })).status);
eq("carol has no access to Welcome before sharing", 404, (await carol.req("GET", `/api/documents/${W}`)).status);
const s1 = await alice.req("POST", `/api/documents/${W}/shares`, { email: "carol@example.com", permission: "viewer" });
eq("share Welcome with carol as viewer", "200/viewer", `${s1.status}/${s1.json?.share?.permission}`);
eq("carol now GETs Welcome as viewer", "200/viewer", (await (async () => { const r = await carol.req("GET", `/api/documents/${W}`); return `${r.status}/${r.json?.role}`; })()));
eq("carol (viewer) PATCH Welcome", 403, (await carol.req("PATCH", `/api/documents/${W}`, { title: "x" })).status);
const s2 = await alice.req("POST", `/api/documents/${W}/shares`, { email: "carol@example.com", permission: "editor" });
eq("re-share carol as editor updates (no error)", "200/editor", `${s2.status}/${s2.json?.share?.permission}`);
const sharesNow = (await alice.req("GET", `/api/documents/${W}/shares`)).json.shares;
eq("exactly one share row for carol after re-share", 1, sharesNow.filter((s) => s.user.email === "carol@example.com").length);
eq("carol (editor) PATCH Welcome", 200, (await carol.req("PATCH", `/api/documents/${W}`, { title: "Welcome (carol was here)" })).status);
const s3 = await alice.req("POST", `/api/documents/${W}/shares`, { email: "carol@example.com", permission: "viewer" });
eq("downgrade carol back to viewer", "200/viewer", `${s3.status}/${s3.json?.share?.permission}`);
eq("carol (downgraded) PATCH Welcome", 403, (await carol.req("PATCH", `/api/documents/${W}`, { title: "x" })).status);
eq("DELETE share with invalid uuid", 400, (await alice.req("DELETE", `/api/documents/${W}/shares`, { userId: "abc" })).status);
eq("DELETE share (carol)", 204, (await alice.req("DELETE", `/api/documents/${W}/shares`, { userId: U["carol@example.com"].id })).status);
eq("DELETE share again", 404, (await alice.req("DELETE", `/api/documents/${W}/shares`, { userId: U["carol@example.com"].id })).status);
eq("carol loses access after unshare", 404, (await carol.req("GET", `/api/documents/${W}`)).status);

// ---- validation ----
eq("GET invalid uuid", 400, (await alice.req("GET", "/api/documents/not-a-uuid")).status);
eq("PATCH invalid uuid", 400, (await alice.req("PATCH", "/api/documents/123", { title: "x" })).status);
eq("DELETE invalid uuid", 400, (await alice.req("DELETE", "/api/documents/abc")).status);
eq("shares GET invalid uuid", 400, (await alice.req("GET", "/api/documents/nope/shares")).status);
eq("GET unknown (valid) uuid", 404, (await alice.req("GET", "/api/documents/9d3c1f0a-6b1e-4c2f-8a55-0a1b2c3d4e5f")).status);
const tmp = (await alice.req("POST", "/api/documents", { title: "Validation scratch" })).json.document;
const bigText = "x".repeat(1024 * 1024 + 10);
eq("PATCH oversized content (>1 MB)", 400, (await alice.req("PATCH", `/api/documents/${tmp.id}`, { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: bigText }] }] } })).status);
eq("PATCH malformed JSON", 400, (await alice.req("PATCH", `/api/documents/${tmp.id}`, "{bad json", { raw: true })).status);
eq("PATCH empty body", 400, (await alice.req("PATCH", `/api/documents/${tmp.id}`, "", { raw: true })).status);
eq("PATCH {} (no fields)", 400, (await alice.req("PATCH", `/api/documents/${tmp.id}`, {})).status);
eq("PATCH content wrong root type", 400, (await alice.req("PATCH", `/api/documents/${tmp.id}`, { content: { type: "paragraph", content: [{ type: "paragraph" }] } })).status);
eq("PATCH content is a string", 400, (await alice.req("PATCH", `/api/documents/${tmp.id}`, { content: "hello" })).status);
eq("PATCH blank title", 400, (await alice.req("PATCH", `/api/documents/${tmp.id}`, { title: "   " })).status);
eq("PATCH 201-char title", 400, (await alice.req("PATCH", `/api/documents/${tmp.id}`, { title: "a".repeat(201) })).status);
const badMsg = (await alice.req("PATCH", `/api/documents/${tmp.id}`, { title: "" })).json;
eq("400 body is readable", "invalid_request: title must not be empty", `${badMsg?.error?.code}: ${badMsg?.error?.message}`);
eq("failed PATCHes did not change the doc", "Validation scratch", (await alice.req("GET", `/api/documents/${tmp.id}`)).json.document.title);

// ---- create / persist / cascade / cross-document isolation ----
const created = await alice.req("POST", "/api/documents", { title: "  E2E created doc  " });
eq("POST /api/documents -> 201 owner", "201/owner/E2E created doc", `${created.status}/${created.json?.role}/${created.json?.document?.title}`);
eq("new doc has default empty TipTap doc", JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), JSON.stringify(created.json?.document?.content));
const noTitle = await alice.req("POST", "/api/documents");
eq("POST with no body -> 201 'Untitled'", "201/Untitled", `${noTitle.status}/${noTitle.json?.document?.title}`);
const N = created.json.document.id;
const fresh = await alice.req("GET", `/api/documents/${N}`);
eq("created doc persists on fresh GET", "200/E2E created doc", `${fresh.status}/${fresh.json?.document?.title}`);
eq("created doc appears in alice's owned list", true, (await alice.req("GET", "/api/documents")).json.owned.some((d) => d.id === N));
eq("POST invalid title", 400, (await alice.req("POST", "/api/documents", { title: "" })).status);
// bob is an editor on Welcome; that share must NOT leak onto alice's other documents
eq("bob (editor on Welcome) GET alice's OTHER doc", 404, (await bob.req("GET", `/api/documents/${N}`)).status);
eq("bob (editor on Welcome) PATCH alice's OTHER doc", 404, (await bob.req("PATCH", `/api/documents/${N}`, { title: "x" })).status);
await alice.req("POST", `/api/documents/${N}/shares`, { email: "bob@example.com", permission: "viewer" });
eq("bob is viewer on the new doc and editor on Welcome (independent)", "viewer/editor",
  `${(await bob.req("GET", `/api/documents/${N}`)).json.role}/${(await bob.req("GET", `/api/documents/${W}`)).json.role}`);
eq("owner DELETE new doc", 204, (await alice.req("DELETE", `/api/documents/${N}`)).status);
eq("deleted doc is gone for owner", 404, (await alice.req("GET", `/api/documents/${N}`)).status);
eq("deleted doc is gone for the sharee (cascade)", 404, (await bob.req("GET", `/api/documents/${N}`)).status);
eq("deleted doc not in bob's shared list", false, (await bob.req("GET", "/api/documents")).json.shared.some((d) => d.id === N));
await alice.req("DELETE", `/api/documents/${tmp.id}`);
await alice.req("DELETE", `/api/documents/${noTitle.json.document.id}`);

// ---- misc ----
const login = await anon.req("GET", "/login");
eq("/login page renders seeded users", "200/true", `${login.status}/${login.text.includes("Continue as Alice") && login.text.includes("Continue as Bob") && login.text.includes("Continue as Carol")}`);
eq("/ redirects (no cookie) to /login", "307 /login", await (async () => { const r = await fetch(BASE + "/", { redirect: "manual" }); return `${r.status} ${r.headers.get("location")}`; })());
const out = await alice.req("POST", "/api/auth/logout");
eq("logout", 204, out.status);
check("logout clears cookie (Max-Age=0 / expired)", "true", String(/max-age=0|expires=thu, 01 jan 1970/i.test(out.setCookie ?? "")));

// ---- report ----
console.log(`| # | Request / scenario | Expected | Actual | |`);
rows.forEach((r, i) => console.log(`| ${i + 1} | ${r.label} | ${r.expected} | ${r.actual} | ${r.ok ? "PASS" : "FAIL"} |`));
console.log(`\n${rows.length - failures}/${rows.length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
