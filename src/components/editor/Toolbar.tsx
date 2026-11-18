"use client";

// Formatting toolbar: Bold, Italic, Underline, H1, H2, bullet list, numbered list.
// Buttons reflect the formatting at the cursor (aria-pressed + highlight). The
// keyboard shortcuts (Ctrl/⌘+B, I, U, ...) come from the TipTap extensions.

import { useEditorState, type Editor } from "@tiptap/react";
import type { ReactNode } from "react";

interface Item {
  id: string;
  label: string;
  hint: string;
  content: ReactNode;
  active: boolean;
  run: (editor: Editor) => void;
}

export default function Toolbar({ editor }: { editor: Editor | null }) {
  // The editor does not re-render React on every transaction, so subscribe to what we need.
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      h1: editor?.isActive("heading", { level: 1 }) ?? false,
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
    }),
  });

  const groups: Item[][] = [
    [
      {
        id: "bold",
        label: "Bold",
        hint: "Bold (Ctrl/⌘+B)",
        content: <span className="font-bold">B</span>,
        active: active?.bold ?? false,
        run: (e) => e.chain().focus().toggleBold().run(),
      },
      {
        id: "italic",
        label: "Italic",
        hint: "Italic (Ctrl/⌘+I)",
        content: <span className="italic">I</span>,
        active: active?.italic ?? false,
        run: (e) => e.chain().focus().toggleItalic().run(),
      },
      {
        id: "underline",
        label: "Underline",
        hint: "Underline (Ctrl/⌘+U)",
        content: <span className="underline">U</span>,
        active: active?.underline ?? false,
        run: (e) => e.chain().focus().toggleUnderline().run(),
      },
    ],
    [
      {
        id: "h1",
        label: "Heading 1",
        hint: "Heading 1 (Ctrl/⌘+Alt+1)",
        content: "H1",
        active: active?.h1 ?? false,
        run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        label: "Heading 2",
        hint: "Heading 2 (Ctrl/⌘+Alt+2)",
        content: "H2",
        active: active?.h2 ?? false,
        run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      },
    ],
    [
      {
        id: "bulletList",
        label: "Bullet list",
        hint: "Bullet list (Ctrl/⌘+Shift+8)",
        content: "• List",
        active: active?.bulletList ?? false,
        run: (e) => e.chain().focus().toggleBulletList().run(),
      },
      {
        id: "orderedList",
        label: "Numbered list",
        hint: "Numbered list (Ctrl/⌘+Shift+7)",
        content: "1. List",
        active: active?.orderedList ?? false,
        run: (e) => e.chain().focus().toggleOrderedList().run(),
      },
    ],
  ];

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 shadow-sm"
    >
      {groups.map((group, i) => (
        <div key={i} className="flex items-center gap-1">
          {group.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-pressed={item.active}
              title={item.hint}
              disabled={!editor}
              // Keep the text selection: do not let the button steal focus from the editor.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor && item.run(editor)}
              className={`min-w-9 rounded-md px-2 py-1 text-sm transition focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40 ${
                item.active ? "bg-blue-100 text-blue-800" : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {item.content}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
