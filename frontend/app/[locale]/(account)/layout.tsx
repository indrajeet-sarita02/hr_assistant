import type { ReactNode } from "react";

import { AccountShell } from "@/components/layout/AccountShell";

export const dynamic = "force-dynamic";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
