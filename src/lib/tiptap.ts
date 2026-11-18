// The ONE TipTap schema for the app. The editor, the file import (HTML -> JSON) and
// pasted content all go through these extensions, so exactly the same set of
// nodes and marks can exist everywhere:
//
//   nodes: paragraph, heading (levels 1-2), bulletList, orderedList, listItem, hardBreak
//   marks: bold, italic, underline
//
// Anything else (images, tables, links, code, blockquotes, ...) is dropped by the
// schema when HTML is parsed. That is what keeps imported files safe: we never
// sanitize HTML by hand, the schema simply has no place to put unsupported markup.

import Heading from "@tiptap/extension-heading";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

/** Headings deeper than 2 are mapped to level 2 instead of being lost. */
export const MAX_HEADING_LEVEL = 2;

const LimitedHeading = Heading.configure({ levels: [1, 2] }).extend({
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      attrs: { level: Math.min(level, MAX_HEADING_LEVEL) },
    }));
  },
});

export function createExtensions(options: { placeholder?: string } = {}) {
  return [
    StarterKit.configure({
      heading: false, // replaced by LimitedHeading
      underline: false, // registered explicitly below (v3 bundles one; avoid a duplicate)
      // Features the toolbar does not offer: not part of the schema.
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      link: false,
    }),
    LimitedHeading,
    Underline,
    Placeholder.configure({
      placeholder: options.placeholder ?? "Start writing…",
    }),
  ];
}
