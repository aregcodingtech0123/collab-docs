// Robustness fuzz: malformed input must never produce a 5xx. Every request below is bad on
// purpose (broken JSON, wrong content types, huge or odd values, strange ids), and the expected
// answer is a 4xx. A 5xx, a hang, or a leaked stack trace fails the suite.
import { BASE, apiLogin, assertSafeTarget, createChecker, preflight, SEED } from "./lib/env.mjs";

assertSafeTarget("API suite: fuzz (malformed input)");
await preflight();

const { check, report } = createChecker();
const alice = await apiLogin("alice@example.com");
const W = SEED.welcome;
const created = [];

/** Sends a request and reports the status; network errors count as failures. */
async function send(method, path, { body, type, cookie = alice, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (type) h["Content-Type"] = type;
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers: h, body });
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: -1, text: String(e?.cause?.code ?? e?.message) };
  }
}
const json = (v) => JSON.stringify(v);
const J = "application/json";
const leaks = (t) => /at \w+ \(|node_modules|\.tsx?:\d+|ZodError|TypeError|ECONN|DATABASE_URL|neon\.tech|postgres/i.test(t);

/** Each case must answer 4xx (or the listed statuses) and must not leak internals. */
async function expectClientError(label, method, path, opts, allowed) {
  const r = await send(method, path, opts);
  const ok = allowed ? allowed.includes(r.status) : r.status >= 400 && r.status < 500;
  const expected = allowed ? allowed.join("|") : "4xx";
  // Show the real status when it is not what we expect; flag any leaked internals.
  check(label, expected, `${ok ? expected : r.status}${leaks(r.text) ? " + LEAK" : ""}`);
  return r;
}

// A scratch document owned by Alice for the PATCH / DELETE / share cases.
const scratch = JSON.parse((await send("POST", "/api/documents", { body: json({ title: "fuzz scratch" }), type: J })).text).document.id;
created.push(scratch);

/**
 * POST /api/documents is the one endpoint where "nothing useful" is valid: an empty body, {} or
 * an object with only unknown keys creates a document with the default title (201).
 */
function createsWithDefaults(path, body) {
  if (path !== "/api/documents") return false;
  if (body.replace(/^﻿/, "").trim() === "") return true;
  try {
    const v = JSON.parse(body.replace(/^﻿/, "")); // the server decodes the body as UTF-8, which drops a BOM
    return v !== null && typeof v === "object" && !Array.isArray(v) && !("title" in v);
  } catch {
    return false;
  }
}

const deep = (n) => { let node = { type: "paragraph" }; for (let i = 0; i < n; i++) node = { type: "bulletList", content: [node] }; return node; };
const nonsense = [null, true, 7, "str", [], [1, 2], {}, { a: 1 }];

// ---- broken bodies on every JSON endpoint ---------------------------------------------
const jsonEndpoints = [
  ["POST", "/api/auth/login"],
  ["POST", "/api/documents"],
  ["PATCH", `/api/documents/${scratch}`],
  ["POST", `/api/documents/${scratch}/shares`],
  ["DELETE", `/api/documents/${scratch}/shares`],
];
for (const [method, path] of jsonEndpoints) {
  const tag = `${method} ${path.replace(scratch, ":id")}`;
  for (const [what, body] of [["truncated JSON", '{"title":'], ["not JSON", "hello world"], ["only whitespace", "   "], ["trailing garbage", '{"a":1}}}'], ["unterminated string", '{"a":"x'], ["NaN literal", '{"a":NaN}'], ["BOM + JSON", "﻿{}"], ["100 KB of braces", "{".repeat(100_000)], ["deeply nested arrays (100k)", "[".repeat(100_000)]]) {
    await expectClientError(`${tag}: ${what}`, method, path, { body, type: J }, createsWithDefaults(path, body) ? [201] : undefined);
  }
  for (const v of nonsense) {
    await expectClientError(`${tag}: body is ${json(v)}`, method, path, { body: json(v), type: J }, createsWithDefaults(path, json(v)) ? [201] : undefined);
  }
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/xml", "", "garbage"]) {
    const r = await send(method, path, { body: '{"email":"x"}', type: type || undefined });
    check(`${tag}: content-type ${json(type)} (no 5xx)`, "<500", r.status < 500 ? "<500" : r.status);
  }
}

// ---- hostile values -------------------------------------------------------------------
const nul = "a\u0000b";
const lone = "x\ud800y";
const titleCases = [
  ["empty", ""], ["whitespace", "   "], ["201 chars", "a".repeat(201)], ["1 MB title", "a".repeat(1024 * 1024)],
  ["NUL character", nul], ["lone surrogate", lone], ["number", 5], ["array", ["a"]], ["object", { a: 1 }], ["null", null],
];
for (const [what, title] of titleCases) {
  await expectClientError(`POST /api/documents: title ${what}`, "POST", "/api/documents", { body: json({ title }), type: J });
  await expectClientError(`PATCH title ${what}`, "PATCH", `/api/documents/${scratch}`, { body: json({ title }), type: J });
}
const contentCases = [
  ["string", "x"], ["empty doc", { type: "doc" }], ["empty content", { type: "doc", content: [] }], ["wrong type", { type: "x", content: [{ type: "paragraph" }] }],
  ["node without type", { type: "doc", content: [{}] }], ["array root", [{ type: "doc" }]],
  ["NUL in text", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: nul }] }] }],
  ["lone surrogate in text", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: lone }] }] }],
  ["NUL in a node type", { type: "doc", content: [{ type: nul }] }],
  ["NUL in an object key", { type: "doc", content: [{ type: "paragraph", attrs: { [nul]: 1 } }] }],
  ["nested 300 deep", { type: "doc", content: [deep(300)] }],
  ["nested 5,000 deep", { type: "doc", content: [deep(5000)] }],
  ["__proto__ key", JSON.parse('{"type":"doc","content":[{"type":"paragraph"}],"__proto__":{"x":1}}')],
];
for (const [what, content] of contentCases) {
  // An unknown extra key is not harmful: the structure is still a valid document (200).
  const allowed = what === "__proto__ key" ? [200] : undefined;
  await expectClientError(`PATCH content ${what}`, "PATCH", `/api/documents/${scratch}`, { body: json({ content }), type: J }, allowed);
}
// the scratch doc must still be intact and readable after all of that
const after = await send("GET", `/api/documents/${scratch}`);
check("scratch document still readable after the fuzz", 200, after.status);

// ---- ids, params and routes -------------------------------------------------------------
const odd = ["not-a-uuid", "0", "%00", "%E0%A4%A", "..%2F..%2Fetc%2Fpasswd", "%27%3B%20DROP%20TABLE%20documents%3B--", "a".repeat(5000), `${W}%00`, `${W}%20`, W.toUpperCase(), "00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff", "%F0%9F%8E%89"];
for (const id of odd) {
  for (const [method, suffix] of [["GET", ""], ["PATCH", ""], ["DELETE", ""], ["GET", "/shares"], ["POST", "/shares"], ["DELETE", "/shares"]]) {
    const r = await send(method, `/api/documents/${id}${suffix}`, { body: method === "GET" ? undefined : json({ title: "x", email: "bob@example.com", permission: "viewer", userId: SEED.welcome }), type: method === "GET" ? undefined : J });
    check(`${method} /api/documents/${id.length > 30 ? id.slice(0, 12) + "…" : id}${suffix}: no 5xx`, "<500", r.status < 500 ? "<500" : `${r.status}${leaks(r.text) ? " + LEAK" : ""}`);
  }
}
for (const [method, path] of [["PUT", "/api/documents"], ["PATCH", "/api/documents"], ["DELETE", "/api/documents"], ["PUT", `/api/documents/${scratch}`], ["GET", "/api/auth/login"], ["GET", "/api/documents/import"], ["POST", "/api/users"]]) {
  await expectClientError(`wrong method: ${method} ${path.replace(scratch, ":id")}`, method, path, {}, [404, 405]);
}
await expectClientError("unknown API route", "GET", "/api/nope", {}, [404]);
for (const email of ["", "a", "a@b", `${"a".repeat(300)}@example.com`, "a@@b.co", "a b@c.co", nul + "@x.co", "x@y.co\u0000", json(["a@b.co"]), "ａ@example.com"]) {
  await expectClientError(`login email ${json(email).slice(0, 40)}`, "POST", "/api/auth/login", { body: json({ email }), type: J, cookie: null });
  await expectClientError(`share email ${json(email).slice(0, 40)}`, "POST", `/api/documents/${scratch}/shares`, { body: json({ email, permission: "viewer" }), type: J });
}
for (const permission of ["owner", "", null, 1, ["viewer"], "VIEWER", "viewer\u0000"]) {
  await expectClientError(`share permission ${json(permission)}`, "POST", `/api/documents/${scratch}/shares`, { body: json({ email: "bob@example.com", permission }), type: J });
}
for (const userId of ["x", "", null, 5, nul, W.slice(0, -1)]) {
  await expectClientError(`unshare userId ${json(userId)}`, "DELETE", `/api/documents/${scratch}/shares`, { body: json({ userId }), type: J });
}

// ---- cookies and headers ----------------------------------------------------------------
for (const cookie of ["collab_user_id=", "collab_user_id=%00", "collab_user_id=" + "a".repeat(8000), "collab_user_id=a; collab_user_id=b", "collab_user_id=é", ";;;", "collab_user_id==="]) {
  const r = await send("GET", "/api/documents", { cookie });
  check(`odd cookie ${json(cookie).slice(0, 30)}: 401, not 5xx`, 401, r.status);
}
const odd2 = await send("GET", "/api/documents", { headers: { "X-Forwarded-For": "a".repeat(5000), Accept: "☃", "Accept-Language": "é" } });
check("odd request headers: no 5xx", "<500", odd2.status < 500 ? "<500" : odd2.status);

// ---- pages with strange ids -----------------------------------------------------------------
for (const id of ["not-a-uuid", "%00", "%E0%A4%A", "a".repeat(3000), "00000000-0000-0000-0000-000000000000"]) {
  const r = await send("GET", `/documents/${id}`);
  check(`page /documents/${id.length > 30 ? id.slice(0, 12) + "…" : id}: no 5xx`, "<500", r.status < 500 ? "<500" : `${r.status}`);
}

// Clean up: the scratch document and any document a "creates with defaults" case made.
const seedIds = new Set(Object.values(SEED));
const mine = JSON.parse((await send("GET", "/api/documents")).text).owned.map((d) => d.id);
for (const id of [...created, ...mine]) if (!seedIds.has(id)) await send("DELETE", `/api/documents/${id}`);
process.exit(report("API suite: fuzz (malformed input)") ? 1 : 0);
