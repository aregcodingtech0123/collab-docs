// Editor page for a single document.
// TODO: load the document + the user's role (behind <Suspense>), 404 when no access,
// render RenameTitle, SaveStatus, ShareDialog (owner only) and Editor (read-only for viewers).
//
// With Cache Components, `params` is runtime data and must be awaited inside <Suspense>.

import { Suspense } from "react";

export default function DocumentPage(props: PageProps<"/documents/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-zinc-500">Loading…</p>}>
      <DocumentView params={props.params} />
    </Suspense>
  );
}

async function DocumentView({
  params,
}: {
  params: PageProps<"/documents/[id]">["params"];
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <p className="text-sm text-zinc-500">Editor for document {id} (TODO)</p>
    </main>
  );
}
