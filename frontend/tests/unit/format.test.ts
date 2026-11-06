/**
 * Frontend.md §5.3 / §7 — locale-aware formatting rules.
 *
 * Dates are normalized at the boundary and formatted only at render time;
 * empty/invalid values must never render as a raw timestamp token.
 */
import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  formatDate,
  formatNumber,
  humanize,
  initials,
  shortReference,
  toDateInputValue,
} from "@/lib/format";

describe("formatDate", () => {
  it("renders an ISO date in the requested locale and timezone", () => {
    const en = formatDate("2026-04-01T00:00:00Z", "en", "UTC", {
      month: "long",
    });
    const hi = formatDate("2026-04-01T00:00:00Z", "hi", "UTC", {
      month: "long",
    });
    expect(en).toContain("2026");
    expect(en).toContain("April");
    expect(hi).toContain("2026");
    expect(hi).not.toBe(en);
  });

  it("renders a safe placeholder for empty or invalid values", () => {
    expect(formatDate(null, "en")).toBe("—");
    expect(formatDate("", "en")).toBe("—");
    expect(formatDate("not-a-date", "en")).toBe("—");
  });
});

describe("formatNumber and formatCurrency", () => {
  it("formats numerics for locale display", () => {
    expect(formatNumber("123456", "en")).toBe("1,23,456");
    expect(formatNumber(5, "en")).toBe("5");
  });

  it("keeps currency explicit with the ISO code (FR-023)", () => {
    expect(formatCurrency("250000", "en", "INR")).toContain("₹");
    expect(formatCurrency("250000", "en", "USD")).toContain("$");
  });

  it("never throws when given non-numeric text", () => {
    expect(formatNumber("n/a", "en")).toBe("n/a");
    expect(formatCurrency(null, "en")).toBe("—");
  });
});

describe("helpers", () => {
  it("humanizes machine-coded values for display", () => {
    expect(humanize("needs_clarification")).toBe("Needs Clarification");
  });

  it("masks long identifiers to a short reference", () => {
    expect(shortReference("a1b2c3d4-e5f6", 8)).toBe("A1B2C3D4");
    expect(shortReference(null)).toBe("—");
  });

  it("derives initials safely", () => {
    expect(initials("Asha   Rani")).toBe("AR");
    expect(initials("")).toBe("?");
  });

  it("truncates dates to the YYYY-MM-DD form for <input type=date>", () => {
    expect(toDateInputValue("2026-04-01T10:30:00Z")).toBe("2026-04-01");
    expect(toDateInputValue(null)).toBe("");
  });
});
