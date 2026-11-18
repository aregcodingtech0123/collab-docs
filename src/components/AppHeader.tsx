// Shared header for the /documents pages: app name, user switcher, log out.

import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import UserSwitcher from "@/components/UserSwitcher";
import type { User } from "@/types";

export default function AppHeader({ user, users }: { user: User; users: User[] }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/documents" className="text-lg font-semibold tracking-tight">
          Collab Docs
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <UserSwitcher current={user} users={users} />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
