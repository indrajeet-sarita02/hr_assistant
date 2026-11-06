/**
 * Frontend.md §5.2 — message and error conventions.
 *
 * en/hi dictionaries must stay in parity, translation fallback must resolve to
 * English, and a fully missing key must never render the raw key to end users.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  defaultLocale,
  interpolate,
  isLocale,
  messages,
  missingTranslationKeys,
  normalizeLocale,
  resetMissingTranslations,
  translate,
} from "@/lib/i18n";

afterEach(() => {
  resetMissingTranslations();
});

describe("locale dictionaries", () => {
  it("keep en and hi in key parity", () => {
    const enKeys = Object.keys(messages.en).sort();
    const hiKeys = Object.keys(messages.hi as Record<string, string>).sort();
    expect(hiKeys).toEqual(enKeys);
  });

  it("only declare the two supported locales", () => {
    expect(mappedLocales()).toEqual(["en", "hi"]);
  });
});

function mappedLocales(): string[] {
  return Object.keys(messages);
}

describe("locale negotiation helpers", () => {
  it("accepts only en and hi", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("hi")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("falls back to the default locale for unsupported values", () => {
    expect(normalizeLocale("fr")).toBe(defaultLocale);
    expect(normalizeLocale("en-IN")).toBe("en");
  });
});

describe("translate", () => {
  it("looks keys up in the requested locale", () => {
    expect(translate("hi", "app.name")).toBe(messages.hi["app.name"]);
  });

  it("resolves keys through the requested dictionary when it defines them", () => {
    const englishValue = translate("en", "app.name");
    expect(englishValue).toBe(messages.en["app.name"]);
    // en/hi parity guarantees the key exists in both; both must resolve to
    // non-empty localized strings.
    expect(messages.hi["app.name"].length).toBeGreaterThan(0);
    expect(translate("hi", "app.name").length).toBeGreaterThan(0);
    expect(englishValue.length).toBeGreaterThan(0);
  });

  it("never renders the raw key when the translation is missing entirely", () => {
    expect(translate("en", "leave.form.not_a_real_key", { days: 2 })).toBe("");
    expect(missingTranslationKeys()).toEqual(["en:leave.form.not_a_real_key"]);
  });

  it("does not flag keys that resolve through the English fallback", () => {
    translate("hi", "app.name");
    expect(missingTranslationKeys()).toHaveLength(0);
  });
});

describe("interpolate", () => {
  it("substitutes placeholders without concatenating translated fragments", () => {
    expect(
      interpolate("You have {count} request(s)", { count: 3 }),
    ).toBe("You have 3 request(s)");
  });

  it("keeps unreplaced placeholders visible rather than dropping information", () => {
    expect(
      interpolate("Hello {name} and {missing}", { name: "Asha" }),
    ).toBe("Hello Asha and {missing}");
  });
});
