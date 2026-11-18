"use client";

// Shared modal dialog primitive. TODO: build on the native <dialog> element
// (focus trap, Esc to close, backdrop click).

import type { ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Dialog({ open, title, children }: DialogProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  );
}
