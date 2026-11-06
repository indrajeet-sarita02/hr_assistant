/**
 * Frontend.md §9.2 — status badges convey state by text label plus tone, never
 * by colour alone. Unknown codes must render the localized unknown label rather
 * than the raw machine key.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/layout/LocaleProvider";
import { PriorityBadge, StatusBadge } from "@/components/ui/StatusBadge";

function withLocale(locale: "en" | "hi", ui: React.ReactNode) {
  return <LocaleProvider locale={locale}>{ui}</LocaleProvider>;
}

describe("StatusBadge", () => {
  it("renders the localized status label in a badge element", () => {
    render(
      withLocale("en", <StatusBadge status="needs_clarification" />),
    );
    const badge = screen.getByText("Needs clarification");
    expect(badge).toBeTruthy();
  });

  it("renders Hindi labels for Hindi sessions (FR-004)", () => {
    render(withLocale("hi", <StatusBadge status="approved" />));
    const badge = screen.getByText(/स्वीकृत|अनुमोदित/);
    expect(badge).toBeTruthy();
  });

  it("falls back to the localized unknown label, never the raw key", () => {
    render(withLocale("en", <StatusBadge status="not_a_real_status" />));
    expect(screen.getByText("Unknown status")).toBeTruthy();
    expect(screen.queryByText("status.not_a_real_status")).toBeNull();
  });

  it("conveys tone via the badge class, not colour alone (§9.2)", () => {
    render(withLocale("en", <StatusBadge status="rejected" />));
    const badge = screen.getByText("Rejected");
    expect(badge.className).toContain("badge-danger");
    expect(badge.textContent).toBe("Rejected");
  });
});

describe("PriorityBadge", () => {
  it("renders an unknown priority safely", () => {
    render(withLocale("en", <PriorityBadge priority="urgent" />));
    expect(screen.getByText(/Urgent|urgent/)).toBeTruthy();
  });
});
