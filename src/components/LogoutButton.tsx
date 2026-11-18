"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Even if the request failed, leave: the next page re-checks the cookie.
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" onClick={logout} disabled={pending}>
      {pending ? "Logging out…" : "Log out"}
    </Button>
  );
}
