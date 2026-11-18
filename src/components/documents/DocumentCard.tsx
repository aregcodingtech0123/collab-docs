// A document in the list: title, last updated, owner, and an Owner / Shared badge.
// The whole card is one link to the editor.

import Link from "next/link";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relativeTime";
import type { DocumentSummary } from "@/types";

const ROLE_BADGE: Record<DocumentSummary["role"], { label: string; tone: BadgeTone }> = {
  owner: { label: "Owner", tone: "neutral" },
  editor: { label: "Shared · Editor", tone: "blue" },
  viewer: { label: "Shared · Viewer", tone: "amber" },
};

export default function DocumentCard({ document }: { document: DocumentSummary }) {
  const badge = ROLE_BADGE[document.role];
  const updated = new Date(document.updatedAt);

  return (
    <li>
      <Link
        href={`/documents/${document.id}`}
        className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-300 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900">{document.title}</p>
          <p className="mt-0.5 text-sm text-zinc-500">
            <time dateTime={updated.toISOString()} title={formatAbsoluteTime(updated)}>
              Updated {formatRelativeTime(updated)}
            </time>
            <span aria-hidden="true"> · </span>
            <span>Owner: {document.owner.name}</span>
          </p>
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </Link>
    </li>
  );
}
