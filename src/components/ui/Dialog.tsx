"use client";

// Modal dialog built on the native <dialog> element + showModal(), which gives us for free:
//   - focus trapped inside the dialog, the rest of the page inert
//   - Esc closes it
//   - role="dialog" semantics
// On top of that: aria-labelledby, focus moves to the dialog title on open, focus returns
// to the element that opened it on close, and clicking the backdrop closes it.

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Dialog({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      // Start at the title: it is announced by screen readers and does not hide anything.
      (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? titleRef.current)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /**
   * A modal <dialog> makes the page inert, but Tab can still leave the document for the
   * browser UI. Wrap Tab / Shift+Tab at the ends so focus really stays inside.
   */
  function trapTab(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== "Tab") return;
    const dialog = e.currentTarget;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0,
    );
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === titleRef.current || active === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function handleClose() {
    // Native "close" fires for Esc and for dialog.close(). Make sure focus goes back.
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      onKeyDown={trapTab}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself, not on its content.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border-0 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40"
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-lg font-semibold outline-none">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="-m-1 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <span aria-hidden="true" className="block h-5 w-5 text-center text-xl leading-5">
                ×
              </span>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
