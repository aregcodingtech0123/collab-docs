// Small label, e.g. "Owner" / "Shared". TODO: colour variants.

import type { ReactNode } from "react";

export default function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{children}</span>;
}
