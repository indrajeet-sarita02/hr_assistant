import type { Metadata } from "next";
import "./globals.css";

// Frontend.md §5.1: localized public pages emit hreflang alternates; a
// configurable metadata base keeps absolute OG/Twitter URLs deployment-correct
// instead of falling back to localhost.
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://localhost:3000"
  ),
  title: {
    default: "HR Assist",
    template: "%s · HR Assist",
  },
  description:
    "A bilingual HR workspace for policy answers, leave, service requests, onboarding and hiring.",
  applicationName: "HR Assist",
  formatDetection: { telephone: false, address: false, email: false },
  other: {
    "color-scheme": "light",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0f5f57" />
      </head>
      <body>{children}</body>
    </html>
  );
}
