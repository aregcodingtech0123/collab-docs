// Shell for every /documents page: auth gate + shared header.
// Each page also checks the user itself: layouts are not re-rendered on every
// navigation, so they cannot be the only line of defence.

import AppHeader from "@/components/AppHeader";
import { listUsers, requireUserOrRedirect } from "@/lib/auth";

export default async function DocumentsLayout({ children }: LayoutProps<"/documents">) {
  const user = await requireUserOrRedirect();
  const users = await listUsers();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 text-zinc-900">
      <AppHeader user={user} users={users} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
