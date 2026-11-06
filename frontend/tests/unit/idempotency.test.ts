/**
 * Frontend.md §7.1/§7.3 — idempotency key rules.
 *
 * One key per submission intent, reused across retries of that intent; a new
 * intent must receive a fresh key.
 */
import { describe, expect, it } from "vitest";

import { newIdempotencyKey, newRequestId } from "@/lib/idempotency";

describe("newIdempotencyKey", () => {
  it("produces a fresh key for every new submission intent", () => {
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("returns a retry-safe string that is safe to send as a header", () => {
    expect(newIdempotencyKey()).toMatch(/^[\w-]+$/);
  });
});

describe("newRequestId", () => {
  it("is bounded to 32 correlation characters (backend §7.2 X-Request-Id)", () => {
    const id = newRequestId();
    expect(id).toMatch(/^[A-Za-z0-9]{8,32}$/);
    expect(id.length).toBeLessThanOrEqual(32);
  });
});
