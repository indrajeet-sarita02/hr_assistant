"use client";

import { useEffect } from "react";

import { AuthStatusCard } from "@/components/auth/AuthStatusCard";
import { useSession } from "@/components/layout/SessionProvider";

// Signed-out confirmation screen (Frontend.md §3.1 /auth/sign-out, §6.4).
// Clears the session when the screen is opened while a session cookie is
// still present, so both in-app sign-out buttons and direct navigation end
// with the same state.
export function SignOutView({ next }: { next?: string }) {
  const { status, logout } = useSession();

  useEffect(() => {
    if (status === "authenticated") void logout();
  }, [status, logout]);

  return <AuthStatusCard kind="sign-out" next={next} />;
}
