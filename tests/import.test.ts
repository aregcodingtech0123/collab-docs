import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import {
  FALLBACK_TITLE,
  MAX_IMPORT_BYTES,
  extensionOf,
  parseImport,
  titleFromFilename,
} from "@/lib/import";
import { parseDocx } from "@/lib/import/parseDocx";
import { parseMarkdown } from "@/lib/import/parseMarkdown";
import { parseTxt } from "@/lib/import/parseTxt";
import { MAX_CONTENT_BYTES, tiptapDocSchema } from "@/lib/validation";
import type { TipTapNode } from "@/types";
import { buildDocx, imageParagraph, para, run, table, text, zip } from "./helpers/docx";

const bytes = (s: string) => new TextEncoder().encode(s);

// ---- helpers to read the output -------------------------------------------------

/** Compact structural view: heading(1), paragraph, bulletList(listItem(paragraph)), ... */
function shape(node: TipTapNode): string {
  const label = node.type === "heading" ? `heading${node.attrs?.level}` : node.type;
  if (node.type === "text") return `"${node.text}"${node.marks?.length ? `[${node.marks.map((m) => m.type).join("+")}]` : ""}`;
  if (!node.content?.length) return label;
  return `${label}(${node.content.map(shape).join(",")})`;
}
const blocks = (doc: { content?: TipTapNode[] }) => (doc.content ?? []).map(shape);

function allNodeTypes(node: TipTapNode, out = new Set<string>()): Set<string> {
  out.add(node.type);
  node.marks?.forEach((m) => out.add(`mark:${m.type}`));
  node.content?.forEach((c) => allNodeTypes(c, out));
  return out;
}
const SUPPORTED = new Set([
  "doc", "paragraph", "text", "hardBreak", "heading", "bulletList", "orderedList", "listItem",
  "mark:bold", "mark:italic", "mark:underline",
]);
const onlySupported = (doc: TipTapNode) => [...allNodeTypes(doc)].every((t) => SUPPORTED.has(t));

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

// ---- .txt -----------------------------------------------------------------------

describe("parseTxt", () => {
  it("turns blank-line separated blocks into paragraphs", () => {
    expect(blocks(parseTxt("First paragraph.\n\nSecond paragraph.\n\nThird."))).toEqual([
      'paragraph("First paragraph.")',
      'paragraph("Second paragraph.")',
      'paragraph("Third.")',
    ]);
  });

  it("keeps single newlines as hard breaks", () => {
    expect(blocks(parseTxt("line one\nline two\nline three"))).toEqual([
      'paragraph("line one",hardBreak,"line two",hardBreak,"line three")',
    ]);
  });

  it("handles CRLF and old-Mac CR line endings", () => {
    expect(blocks(parseTxt("a\r\nb\r\n\r\nc"))).toEqual(['paragraph("a",hardBreak,"b")', 'paragraph("c")']);
    expect(blocks(parseTxt("a\rb\r\rc"))).toEqual(['paragraph("a",hardBreak,"b")', 'paragraph("c")']);
  });

  it("treats several blank lines, and whitespace-only lines, as one separator", () => {
    expect(blocks(parseTxt("a\n\n\n\n   \n\t\nb"))).toEqual(['paragraph("a")', 'paragraph("b")']);
  });

  it("ignores leading and trailing blank lines and trailing spaces", () => {
    expect(blocks(parseTxt("\n\n  \nhello   \nworld  \n\n\n"))).toEqual(['paragraph("hello",hardBreak,"world")']);
  });

  it("preserves unicode and indentation inside a line", () => {
    expect(blocks(parseTxt("  ünïcödé — 日本語 🎉"))).toEqual(['paragraph("  ünïcödé — 日本語 🎉")']);
  });

  it("never creates empty text nodes", () => {
    const json = JSON.stringify(parseTxt("a\n\nb\nc\n\n\nd"));
    expect(json).not.toContain('"text":""');
  });
});

// ---- .md ------------------------------------------------------------------------

describe("parseMarkdown", () => {
  it("maps headings, bold, italic and underline (raw <u>)", () => {
    const doc = parseMarkdown("# Title\n\n## Sub\n\nPlain **bold** and *italic* and <u>under</u>.");
    expect(blocks(doc)).toEqual([
      'heading1("Title")',
      'heading2("Sub")',
      'paragraph("Plain ","bold"[bold]," and ","italic"[italic]," and ","under"[underline],".")',
    ]);
  });

  it("maps bullet and numbered lists", () => {
    const doc = parseMarkdown("- one\n- two\n\n1. first\n2. second");
    expect(blocks(doc)).toEqual([
      'bulletList(listItem(paragraph("one")),listItem(paragraph("two")))',
      'orderedList(listItem(paragraph("first")),listItem(paragraph("second")))',
    ]);
  });

  it("supports nested lists and formatting inside list items", () => {
    const doc = parseMarkdown("- parent\n  - child **bold**\n");
    expect(blocks(doc)).toEqual([
      'bulletList(listItem(paragraph("parent"),bulletList(listItem(paragraph("child ","bold"[bold])))))',
    ]);
  });

  it.each([3, 4, 5, 6])("degrades a level-%i heading to a level-2 heading, keeping the text", (level) => {
    expect(blocks(parseMarkdown(`${"#".repeat(level)} Deep heading`))).toEqual(['heading2("Deep heading")']);
  });

  it("drops <script>, <style>, images and iframes (and their payloads)", () => {
    const doc = parseMarkdown(
      "Hello\n\n<script>alert('xss')</script>\n\n<style>body{display:none}</style>\n\n" +
        '![alt text](http://evil.example/x.png)\n\n<img src="x" onerror="alert(1)">\n\n' +
        '<iframe src="https://evil.example"></iframe>\n\nBye',
    );
    const out = JSON.stringify(doc);
    expect(out).not.toMatch(/alert|evil|script|onerror|iframe|display:none|img/i);
    expect(out).toContain("Hello");
    expect(out).toContain("Bye");
    expect(onlySupported(doc)).toBe(true);
    // ...and nothing but the two real paragraphs is left (no blank gaps where the images were)
    expect(blocks(doc)).toEqual(['paragraph("Hello")', 'paragraph("Bye")']);
  });

  it("does not leave empty paragraphs behind for image-only lines", () => {
    expect(blocks(parseMarkdown("Before\n\n![a](x.png)\n\nAfter"))).toEqual(['paragraph("Before")', 'paragraph("After")']);
  });

  it("drops link targets but keeps the link text; javascript: URLs never survive", () => {
    const doc = parseMarkdown("[click me](javascript:alert(1)) and [site](https://example.com)");
    const out = JSON.stringify(doc);
    expect(out).not.toMatch(/javascript|href|example\.com|alert/);
    expect(out).toContain("click me");
    expect(out).toContain("site");
  });

  it("flattens unsupported blocks (code, quotes, rules) to supported nodes without losing the text", () => {
    const doc = parseMarkdown("> quoted\n\n```\ncode here\n```\n\n---\n\n`inline`");
    expect(onlySupported(doc)).toBe(true);
    const out = JSON.stringify(doc);
    expect(out).toContain("quoted");
    expect(out).toContain("code here");
    expect(out).toContain("inline");
  });

  it("does not create table nodes for GFM tables (cell text is kept as plain text)", () => {
    const doc = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(onlySupported(doc)).toBe(true);
    expect(JSON.stringify(doc)).toMatch(/a.*b.*1.*2/);
  });
});

// ---- .docx ----------------------------------------------------------------------

describe("parseDocx", () => {
  it("maps headings, bold, italic, underline and plain text", async () => {
    const docx = buildDocx(
      text("Report", { style: "Heading1" }) +
        text("Scope", { style: "Heading2" }) +
        para([run("Plain, "), run("bold", { bold: true }), run(" "), run("italic", { italic: true }), run(" "), run("under", { underline: true })]),
    );
    expect(blocks(await parseDocx(docx))).toEqual([
      'heading1("Report")',
      'heading2("Scope")',
      'paragraph("Plain, ","bold"[bold]," ","italic"[italic]," ","under"[underline])',
    ]);
  });

  it("maps bullet and numbered lists", async () => {
    const docx = buildDocx(
      text("a", { list: 1 }) + text("b", { list: 1 }) + text("break") + text("one", { list: 2 }) + text("two", { list: 2 }),
    );
    expect(blocks(await parseDocx(docx))).toEqual([
      'bulletList(listItem(paragraph("a")),listItem(paragraph("b")))',
      'paragraph("break")',
      'orderedList(listItem(paragraph("one")),listItem(paragraph("two")))',
    ]);
  });

  it.each(["Heading3", "Heading4", "Heading6"])("degrades %s to a level-2 heading", async (style) => {
    expect(blocks(await parseDocx(buildDocx(text("Deep", { style }))))).toEqual(['heading2("Deep")']);
  });

  it("drops images (no image node, no data: URI) but keeps surrounding text", async () => {
    const docx = buildDocx(text("Before") + imageParagraph() + text("After"));
    const doc = await parseDocx(docx);
    const out = JSON.stringify(doc);
    expect(out).not.toMatch(/image|data:|base64|png|img/i);
    expect(out).toContain("Before");
    expect(out).toContain("After");
    expect(onlySupported(doc)).toBe(true);
  });

  it("does not create table nodes (cell text is kept as plain text)", async () => {
    const doc = await parseDocx(buildDocx(text("Intro") + table([["r1c1", "r1c2"], ["r2c1", "r2c2"]])));
    expect(onlySupported(doc)).toBe(true);
    const out = JSON.stringify(doc);
    for (const cell of ["r1c1", "r1c2", "r2c1", "r2c2"]) expect(out).toContain(cell);
  });
});

// ---- parseImport: type, size, emptiness, corruption --------------------------------

describe("parseImport: choosing the parser", () => {
  it.each(["notes.txt", "NOTES.TXT", "Notes.Txt"])("accepts %s as plain text", async (name) => {
    const { content } = await parseImport(name, bytes("a\n\nb"));
    expect(blocks(content)).toEqual(['paragraph("a")', 'paragraph("b")']);
  });

  it.each(["readme.md", "README.MD", "x.Md"])("accepts %s as markdown", async (name) => {
    const { content } = await parseImport(name, bytes("# Hi"));
    expect(blocks(content)).toEqual(['heading1("Hi")']);
  });

  it.each(["doc.docx", "DOC.DOCX", "Doc.DocX"])("accepts %s as Word", async (name) => {
    const { content } = await parseImport(name, buildDocx(text("Hello", { style: "Heading1" })));
    expect(blocks(content)).toEqual(['heading1("Hello")']);
  });

  it.each(["report.pdf", "photo.png", "notes", "archive.tar.gz", "notes.txt.exe", "page.html", "old.doc", ""])(
    "rejects %j as an unsupported type with a readable 400",
    async (name) => {
      const err = await failure(parseImport(name, bytes("some content")));
      expect(err.status).toBe(400);
      expect(err.message).toBe("Unsupported file type. Use .txt, .md or .docx.");
    },
  );

  it("decides by extension even for a path-like name", async () => {
    const { title } = await parseImport("C:\\Users\\me\\Documents\\Plan.txt", bytes("x"));
    expect(title).toBe("Plan");
  });
});

describe("parseImport: empty and non-text files", () => {
  it.each(["a.txt", "a.md", "a.docx"])("rejects a 0-byte %s", async (name) => {
    const err = await failure(parseImport(name, new Uint8Array(0)));
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/empty/i);
  });

  it.each(["a.txt", "a.md"])("rejects a whitespace-only %s", async (name) => {
    for (const content of ["   ", "\n\n\n", " \t\r\n  \n", "\uFEFF", "\uFEFF  \n"]) {
      const err = await failure(parseImport(name, bytes(content)));
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/empty/i);
    }
  });

  it("rejects a .docx that has no text", async () => {
    const err = await failure(parseImport("blank.docx", buildDocx(text("   ") + imageParagraph())));
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/No importable text/);
  });

  it("rejects a markdown file whose only content is dropped (an image)", async () => {
    const err = await failure(parseImport("img.md", bytes("![just an image](x.png)")));
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/No importable text/);
  });

  it("rejects binary data renamed to .txt or .md", async () => {
    const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    for (const name of ["pic.txt", "pic.md"]) {
      const err = await failure(parseImport(name, binary));
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/doesn't look like a text file/);
    }
  });

  it("strips a UTF-8 BOM", async () => {
    const { content } = await parseImport("bom.txt", bytes("\uFEFFhello"));
    expect(blocks(content)).toEqual(['paragraph("hello")']);
  });
});

describe("parseImport: size limit", () => {
  it("rejects a file over 2 MB with 413 and a readable message, before parsing", async () => {
    const err = await failure(parseImport("big.txt", new Uint8Array(MAX_IMPORT_BYTES + 1).fill(97)));
    expect(err.status).toBe(413);
    expect(err.code).toBe("file_too_large");
    expect(err.message).toMatch(/2 MB/);
  });

  it("applies the limit to every type", async () => {
    for (const name of ["big.md", "big.docx"]) {
      expect((await failure(parseImport(name, new Uint8Array(MAX_IMPORT_BYTES + 1)))).status).toBe(413);
    }
  });

  it("accepts a sizeable text file under the limits", async () => {
    const paragraph = "lorem ipsum dolor sit amet ".repeat(20);
    const body = Array.from({ length: 1500 }, () => paragraph).join("\n\n"); // ~0.8 MB
    expect(body.length).toBeLessThan(MAX_IMPORT_BYTES);
    const { content } = await parseImport("long.txt", bytes(body));
    expect(content.content).toHaveLength(1500);
  });

  it("a file within 2 MB whose content would exceed the 1 MB document limit gets a readable 400", async () => {
    const err = await failure(parseImport("huge.txt", new Uint8Array(MAX_IMPORT_BYTES).fill(97)));
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/too large/i);
  });
});

describe("parseImport: corrupt .docx", () => {
  it("rejects random bytes named .docx with a readable 400 (never a 500)", async () => {
    const random = new Uint8Array(4096).map((_, i) => (i * 131 + 17) % 256);
    const err = await failure(parseImport("fake.docx", random));
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_docx");
    expect(err.message).toMatch(/couldn't be read/);
  });

  it("rejects plain text named .docx", async () => {
    expect((await failure(parseImport("notes.docx", bytes("this is not a zip")))).status).toBe(400);
  });

  it("rejects a truncated .docx", async () => {
    const valid = buildDocx(text("Hello"));
    expect((await failure(parseImport("cut.docx", valid.subarray(0, Math.floor(valid.length / 2))))).status).toBe(400);
  });

  it("rejects a valid ZIP that is not a Word document", async () => {
    const err = await failure(parseImport("zip.docx", zip({ "readme.txt": "hello" })));
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_docx");
  });
});

// ---- titles -----------------------------------------------------------------------

describe("filename -> title", () => {
  it.each<[string, string]>([
    ["Plan.txt", "Plan"],
    ["My Report.v2.docx", "My Report.v2"],
    ["  spaced   out  .md", "spaced out"],
    ["UPPER.TXT", "UPPER"],
    ["dir/sub/Notes.md", "Notes"],
    ["dir\\sub\\Notes.md", "Notes"],
    ["tab\tand\nnewline.txt", "tab and newline"],
    ["ünïcödé 日本語.txt", "ünïcödé 日本語"],
  ])("%j -> %j", (filename, expected) => {
    expect(titleFromFilename(filename)).toBe(expected);
  });

  it.each([".md", ".txt", "   .txt", "", "/", ".docx", "\n\t.md"])("falls back to the default for %j", (filename) => {
    expect(titleFromFilename(filename)).toBe(FALLBACK_TITLE);
  });

  it("limits long names to 200 characters", () => {
    const title = titleFromFilename(`${"a".repeat(500)}.txt`);
    expect(title).toHaveLength(200);
  });

  it("does not cut an emoji in half at the limit", () => {
    const title = titleFromFilename(`${"a".repeat(199)}🎉🎉.txt`);
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title).toBe("a".repeat(199)); // the surrogate pair that did not fit is removed whole
  });

  it("is trimmed after truncation", () => {
    expect(titleFromFilename(`${"a".repeat(199)} ${"b".repeat(50)}.txt`)).toBe("a".repeat(199));
  });

  it("extensionOf is case-insensitive", () => {
    expect(extensionOf("A.B.DocX")).toBe(".docx");
    expect(extensionOf("noext")).toBe("");
  });

  it("parseImport returns the title", async () => {
    expect((await parseImport("Quarterly plan.md", bytes("hi"))).title).toBe("Quarterly plan");
    expect((await parseImport(".md", bytes("hi"))).title).toBe(FALLBACK_TITLE);
  });
});

// ---- output validity ----------------------------------------------------------------

describe("output always passes the PATCH content validation", () => {
  const samples: [string, Uint8Array][] = [
    ["a.txt", bytes("just one line")],
    ["b.txt", bytes("x\n\ny\nz\n\n\n\nw")],
    ["c.md", bytes("# H\n\n- a\n- b\n\n1. c\n\n**bold** *i* <u>u</u>\n\n### deep")],
    ["d.md", bytes("<script>alert(1)</script>\n\ntext after")],
    ["e.docx", buildDocx(text("Title", { style: "Heading1" }) + text("li", { list: 1 }) + imageParagraph() + table([["x"]]))],
  ];

  it.each(samples)("%s", async (name, data) => {
    const { title, content } = await parseImport(name, data);
    const check = tiptapDocSchema.safeParse(content);
    expect(check.success).toBe(true);
    expect(content.type).toBe("doc");
    expect(content.content!.length).toBeGreaterThan(0);
    expect(onlySupported(content)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(content)).length).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(200);
  });
});
