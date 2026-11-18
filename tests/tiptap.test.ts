import { getSchema } from "@tiptap/core";
import { generateJSON } from "@tiptap/html/server";
import { describe, expect, it } from "vitest";
import { createExtensions } from "@/lib/tiptap";
import type { TipTapNode } from "@/types";

const extensions = createExtensions();
const schema = getSchema(extensions);

const html = (s: string) => generateJSON(s, extensions) as TipTapNode;

function types(node: TipTapNode, out = new Set<string>()): Set<string> {
  out.add(node.type);
  node.marks?.forEach((m) => out.add(`mark:${m.type}`));
  node.content?.forEach((c) => types(c, out));
  return out;
}

describe("editor schema", () => {
  it("contains exactly the supported nodes and marks", () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(
      ["bulletList", "doc", "hardBreak", "heading", "listItem", "orderedList", "paragraph", "text"].sort(),
    );
    expect(Object.keys(schema.marks).sort()).toEqual(["bold", "italic", "underline"]);
  });
});

describe("HTML -> JSON through the shared extensions", () => {
  it("keeps supported formatting", () => {
    const json = html(
      "<h1>T</h1><h2>S</h2><p><strong>b</strong><em>i</em><u>u</u></p><ul><li><p>x</p></li></ul><ol><li><p>y</p></li></ol>",
    );
    expect([...types(json)].sort()).toEqual(
      ["bulletList", "doc", "heading", "listItem", "mark:bold", "mark:italic", "mark:underline", "orderedList", "paragraph", "text"].sort(),
    );
  });

  it.each([3, 4, 5, 6])("maps <h%i> to a level-2 heading instead of dropping it", (level) => {
    const json = html(`<h${level}>Deep</h${level}>`);
    expect(json.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(json.content?.[0].content?.[0].text).toBe("Deep");
  });

  it("drops unsupported markup (script, style, img, iframe, table structure, links, code)", () => {
    const json = html(
      '<p>safe</p><script>alert(1)</script><style>p{}</style><img src="x" onerror="alert(1)">' +
        '<iframe src="https://evil.example"></iframe><p><a href="javascript:alert(1)">link</a> <code>c</code> <s>s</s></p>' +
        "<blockquote><p>quote</p></blockquote><pre><code>code</code></pre><hr>",
    );
    const serialized = JSON.stringify(json);
    expect(serialized).not.toMatch(/alert|evil|javascript|script|iframe|onerror/);
    expect([...types(json)].every((t) => ["doc", "paragraph", "text", "hardBreak"].includes(t))).toBe(true);
    expect(serialized).toContain("safe");
    expect(serialized).toContain("link"); // the text of a dropped link survives
  });
});
