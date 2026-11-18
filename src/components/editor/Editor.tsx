"use client";

// The document workspace: title, role, save status, toolbar and the TipTap editor.
// Owners and editors can edit (with autosave); viewers get a read-only editor and no toolbar.

import { EditorContent, useEditor, type Editor as TipTapEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import DeleteDocument from "@/components/documents/DeleteDocument";
import RenameTitle from "@/components/documents/RenameTitle";
import ShareDialog from "@/components/documents/ShareDialog";
import SaveStatus from "@/components/editor/SaveStatus";
import Toolbar from "@/components/editor/Toolbar";
import { useAutosave } from "@/components/editor/useAutosave";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { createExtensions } from "@/lib/tiptap";
import type { Role, TipTapDoc } from "@/types";

export interface EditorProps {
  documentId: string;
  title: string;
  initialContent: TipTapDoc;
  role: Exclude<Role, "none">;
  ownerId: string;
  ownerName: string;
  /** Whether the current user is the owner (for "Owned by you"). */
  isOwner: boolean;
}

const ROLE_LABEL: Record<EditorProps["role"], { label: string; tone: BadgeTone }> = {
  owner: { label: "Owner", tone: "neutral" },
  editor: { label: "Editor", tone: "blue" },
  viewer: { label: "View only", tone: "amber" },
};

export default function Editor({ documentId, title, initialContent, role, ownerId, ownerName, isOwner }: EditorProps) {
  const editable = role !== "viewer";
  const editorRef = useRef<TipTapEditor | null>(null);

  const autosave = useAutosave({
    documentId,
    initialContent,
    getContent: () => (editorRef.current ? (editorRef.current.getJSON() as TipTapDoc) : null),
    enabled: editable,
  });

  const editor = useEditor({
    extensions: createExtensions({ placeholder: editable ? "Start writing…" : "" }),
    content: initialContent,
    editable,
    immediatelyRender: false, // avoid SSR hydration mismatches
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": editable ? "Document content" : "Document content (read-only)",
      },
    },
    // onUpdate does not fire for the initial content, so nothing is saved on load.
    onUpdate: () => autosave.markDirty(),
    onBlur: () => autosave.flush(),
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  const roleBadge = ROLE_LABEL[role];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-[14rem] flex-1">
            <RenameTitle documentId={documentId} title={title} editable={editable} />
          </div>
          {/* Only the owner can manage sharing or delete; editors and viewers never see these. */}
          {role === "owner" && (
            <div className="flex items-center gap-2">
              <ShareDialog documentId={documentId} ownerId={ownerId} />
              <DeleteDocument documentId={documentId} />
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
          <Badge tone={roleBadge.tone}>{roleBadge.label}</Badge>
          <span>{isOwner ? "Owned by you" : `Owner: ${ownerName}`}</span>
          {editable && <SaveStatus state={autosave.state} onRetry={autosave.retry} />}
        </div>
      </div>

      {editable && <Toolbar editor={editor} />}

      <div className="mt-3 rounded-lg bg-white px-6 py-8 shadow-sm ring-1 ring-zinc-200 sm:px-14 sm:py-12">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div aria-busy="true" aria-label="Loading editor" className="space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-100" />
          </div>
        )}
      </div>
    </div>
  );
}
