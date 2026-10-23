"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { isLocale } from "@/lib/i18n";

export function DocumentLocale() {
  const pathname = usePathname();

  useEffect(() => {
    const first = pathname.split("/")[1];
    const locale = isLocale(first) ? first : "en";
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.locale = locale;
  }, [pathname]);

  return null;
}
