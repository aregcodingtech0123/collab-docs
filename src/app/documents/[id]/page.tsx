// Editor page for a single document.
// TODO: load the document + the user's role, 404 when no access, render
// RenameTitle, SaveStatus, ShareDialog (owner only) and Editor (read-only for viewers).

export default async function DocumentPage({
  params,
}: PageProps<"/documents/[id]">) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <p className="text-sm text-zinc-500">Editor for document {id} (TODO)</p>
    </main>
  );
}
