import type { ReactNode } from "react";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { SkipLink } from "@/components/layout/SkipLink";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <SkipLink />
      <PublicHeader />
      <main className="public-main" id="main-content" tabIndex={-1}>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
