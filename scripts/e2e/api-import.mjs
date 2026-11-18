// Import API e2e: multipart uploads of .txt/.md/.docx (round trip) and every rejection path.
import { BASE, apiLogin, assertSafeTarget, createChecker, preflight } from "./lib/env.mjs";
import { buildDocx, imageParagraph, para, run, table, text } from "./lib/docx.mjs";

assertSafeTarget("API suite: import");
await preflight();

const { check, report } = createChecker();
const realFetch = globalThis.fetch;
const enc = (s) => new TextEncoder().encode(s);
const created = [];

async function upload(cookie, name, data, field = "file") {
  const form = new FormData();
  form.append(field, new File([data], name));
  let res;
  try {
    res = await realFetch(`${BASE}/api/documents/import`, { method: "POST", headers: cookie ? { Cookie: cookie } : {}, body: form });
  } catch (e) {
    return { status: 0, json: { error: { message: `network error: ${e?.cause?.code ?? e?.message}` } } }; // connection cut
  }
  let body = "";
  try { body = await res.text(); } catch (e) { return { status: -res.status, json: { error: { message: `response truncated: ${e?.cause?.code ?? e?.message}` } } }; }
  let json = null;
  try { json = JSON.parse(body); } catch { /* not JSON */ }
  return { status: res.status, json };
}
const getDoc = (cookie, id) => realFetch(`${BASE}/api/documents/${id}`, { headers: { Cookie: cookie } });
function shape(n) {
  const label = n.type === "heading" ? `h${n.attrs.level}` : n.type;
  if (n.type === "text") return `"${n.text}"${n.marks?.length ? `[${n.marks.map((m) => m.type).join("+")}]` : ""}`;
  return n.content?.length ? `${label}(${n.content.map(shape).join(",")})` : label;
}

const alice = await apiLogin("alice@example.com");
const bob = await apiLogin("bob@example.com");

// ---- valid uploads: 201 + round trip ------------------------------------------------
let r = await upload(alice, "Meeting notes.txt", enc("Agenda\nitem one\n\nSecond paragraph"));
check("valid .txt -> 201 with { document: { id, title } }", "201/Meeting notes", `${r.status}/${r.json?.document?.title}`);
let d = await (await getDoc(alice, r.json.document.id)).json(); created.push(r.json.document.id);
check(".txt round-trip: paragraphs + hard break", 'paragraph("Agenda",hardBreak,"item one")|paragraph("Second paragraph")', d.document.content.content.map(shape).join("|"));
check(".txt: caller is the owner", "owner", d.role);

const md = "# Plan\n\n## Goals\n\nSome **bold**, *italic* and <u>underlined</u> text.\n\n- apple\n- pear\n\n1. one\n2. two\n\n#### Deep\n\n<script>alert('xss')</script>\n\n![img](http://evil.example/a.png)\n\n[bad](javascript:alert(1))\n";
r = await upload(alice, "Roadmap.MD", enc(md));
check("valid .md (upper-case extension) -> 201", "201/Roadmap", `${r.status}/${r.json?.document?.title}`);
d = await (await getDoc(alice, r.json.document.id)).json(); created.push(r.json.document.id);
check(".md round-trip: headings (h4 -> h2), marks, both list types", 'h1("Plan")|h2("Goals")|paragraph("Some ","bold"[bold],", ","italic"[italic]," and ","underlined"[underline]," text.")|bulletList(listItem(paragraph("apple")),listItem(paragraph("pear")))|orderedList(listItem(paragraph("one")),listItem(paragraph("two")))|h2("Deep")|paragraph("bad")', d.document.content.content.map(shape).join("|"));
check(".md hostile markup is NOT stored (script/img/javascript:/evil)", false, /script|alert|evil|javascript|img|href/i.test(JSON.stringify(d.document.content)));

const docx = buildDocx(
  text("Quarterly report", { style: "Heading1" }) + text("Summary", { style: "Heading2" }) +
  para([run("Plain, "), run("bold", { bold: true }), run(" "), run("italic", { italic: true }), run(" "), run("under", { underline: true })]) +
  text("bullet a", { list: 1 }) + text("bullet b", { list: 1 }) + text("step 1", { list: 2 }) + text("step 2", { list: 2 }) +
  imageParagraph() + table([["c1", "c2"]]),
);
r = await upload(alice, "Quarterly report.docx", docx);
check("valid .docx -> 201", "201/Quarterly report", `${r.status}/${r.json?.document?.title}`);
d = await (await getDoc(alice, r.json.document.id)).json(); created.push(r.json.document.id);
check(".docx round-trip: headings, marks, lists", true, d.document.content.content.map(shape).join("|").startsWith('h1("Quarterly report")|h2("Summary")|paragraph("Plain, ","bold"[bold]," ","italic"[italic]," ","under"[underline])|bulletList(listItem(paragraph("bullet a")),listItem(paragraph("bullet b")))|orderedList(listItem(paragraph("step 1")),listItem(paragraph("step 2")))'));
check(".docx image + table dropped (no image/table node, no data: URI; cell text kept)", "false/true", `${/image|table|data:|base64/i.test(JSON.stringify(d.document.content))}/${/c1/.test(JSON.stringify(d.document.content))}`);
check("imported docs are listed for the owner", true, (await (await realFetch(`${BASE}/api/documents`, { headers: { Cookie: alice } })).json()).owned.filter((x) => created.includes(x.id)).length === 3);
check("imported doc is private (another user gets 404)", 404, (await getDoc(bob, created[0])).status);
r = await upload(alice, "DOC.DOCX", docx); created.push(r.json.document.id);
check("valid .DOCX (upper-case extension) -> 201", 201, r.status);
r = await upload(alice, `${"x".repeat(400)}.txt`, enc("hello")); created.push(r.json.document.id);
check("very long filename -> title capped at 200", 200, r.json.document.title.length);
r = await upload(alice, ".md", enc("hello")); created.push(r.json.document.id);
check("name with no stem -> title 'Imported document'", "Imported document", r.json.document.title);

// ---- rejections -----------------------------------------------------------------------
const bad = (label, res, status, rx) => {
  check(`${label}: status`, status, res.status);
  if (rx) check(`${label}: readable message`, true, rx.test(res.json?.error?.message ?? ""));
};
bad(".pdf", await upload(alice, "report.pdf", enc("%PDF-1.4")), 400, /Unsupported file type\. Use \.txt, \.md or \.docx\./);
bad("no extension", await upload(alice, "README", enc("hello")), 400, /Unsupported/);
bad("empty .txt (0 bytes)", await upload(alice, "empty.txt", new Uint8Array(0)), 400, /empty/i);
bad("whitespace-only .md", await upload(alice, "blank.md", enc("  \n\n \t \n")), 400, /empty/i);
bad("binary data renamed .txt", await upload(alice, "pic.txt", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13])), 400, /text file/);
bad("corrupt .docx (random bytes)", await upload(alice, "bad.docx", new Uint8Array(2000).map((_, i) => (i * 37 + 5) % 256)), 400, /couldn't be read/);
bad("corrupt .docx (plain text)", await upload(alice, "bad2.docx", enc("not a zip")), 400, /couldn't be read/);
bad(".md that is only an image", await upload(alice, "img.md", enc("![x](a.png)")), 400, /No importable text/);
bad("file over 2 MB (2 MB + 1)", await upload(alice, "big.txt", new Uint8Array(2 * 1024 * 1024 + 1).fill(97)), 413, /file is too large.*2 MB/);
bad("file far over the limit (8 MB)", await upload(alice, "huge.txt", new Uint8Array(8 * 1024 * 1024).fill(97)), 413, /file is too large.*2 MB/);
bad("2 MB of text: text limit, stated clearly", await upload(alice, "dense.txt", new Uint8Array(2 * 1024 * 1024).fill(97)), 400, /text in this file is too large for one document.*1 MB/);
bad("no file field (file under another name)", await upload(alice, "a.txt", enc("hi"), "document"), 400, /No file was uploaded/);
check("empty multipart form (no parts) -> 400", 400, (await realFetch(`${BASE}/api/documents/import`, { method: "POST", headers: { Cookie: alice }, body: new FormData() })).status);
check("JSON body instead of multipart -> 400", 400, (await realFetch(`${BASE}/api/documents/import`, { method: "POST", headers: { Cookie: alice, "Content-Type": "application/json" }, body: "{}" })).status);
check("no body at all -> 400", 400, (await realFetch(`${BASE}/api/documents/import`, { method: "POST", headers: { Cookie: alice } })).status);
bad("unauthenticated upload", await upload(null, "a.txt", enc("hello")), 401);
check("tampered cookie -> 401", 401, (await upload("collab_user_id=not-a-uuid", "a.txt", enc("hello"))).status);

const monster = await upload(alice, "monster.txt", new Uint8Array(50 * 1024 * 1024).fill(97));
check("50 MB upload: refused with 413 or the connection is cut (never accepted, never a 500)", true, monster.status === 413 || monster.status <= 0);
async function healthy() {
  for (let i = 0; i < 3; i++) { // a cut-off connection may still sit in the client's pool; retry on a fresh one
    try { return (await realFetch(`${BASE}/api/auth/me`, { headers: { Cookie: alice, Connection: "close" } })).status; } catch { await new Promise((res) => setTimeout(res, 200)); }
  }
  return "unreachable";
}
check("...and the server is still healthy afterwards", 200, await healthy());

for (const id of created) await realFetch(`${BASE}/api/documents/${id}`, { method: "DELETE", headers: { Cookie: alice } });
check("cleanup: created documents deleted", 0, (await (await realFetch(`${BASE}/api/documents`, { headers: { Cookie: alice } })).json()).owned.filter((x) => created.includes(x.id)).length);

process.exit(report("API suite: import") ? 1 : 0);
