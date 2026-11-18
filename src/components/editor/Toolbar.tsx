"use client";

// Formatting toolbar: B / I / U / H1 / H2 / bullet list / numbered list.
// TODO: take a TipTap `Editor` instance, wire each button to a chain().focus()... command,
// and reflect active state with editor.isActive().

export default function Toolbar() {
  return <div role="toolbar" aria-label="Formatting" />;
}
