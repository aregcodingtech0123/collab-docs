// Shared TipTap extension config, used by the editor and by anything that needs
// to convert HTML <-> TipTap JSON (e.g. file import), so both agree on schema.

import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

export function createExtensions(options: { placeholder?: string } = {}) {
  return [
    // TipTap v3's StarterKit already bundles Underline; we register the
    // standalone extension explicitly instead, so disable the built-in one to
    // avoid a duplicate-extension warning.
    StarterKit.configure({ underline: false }),
    Underline,
    Placeholder.configure({
      placeholder: options.placeholder ?? "Start writing…",
    }),
  ];
}
