import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
