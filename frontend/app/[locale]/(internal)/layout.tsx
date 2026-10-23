import type { ReactNode } from "react";

import { InternalShell } from "@/components/layout/InternalShell";

export const dynamic = "force-dynamic";

export default function InternalLayout({ children }: { children: ReactNode }) {
  return <InternalShell>{children}</InternalShell>;
}
