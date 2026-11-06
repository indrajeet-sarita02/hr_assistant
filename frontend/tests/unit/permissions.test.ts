/**
 * Frontend.md §4.3/§6 — presentation-only permission helpers.
 *
 * The UI may show or hide navigation by capability, but it must never treat
 * hidden links as authorization. This file pins the exact behaviour of the
 * helper the route guards compose.
 */
import { describe, expect, it } from "vitest";

import {
  canAccessAnyAdmin,
  hasAnyPermission,
  hasPermission,
  permissions,
} from "@/lib/permissions";

const scopedAdmin = [
  permissions.adminMembers,
  permissions.adminSettings,
  permissions.auditRead,
];

describe("hasPermission", () => {
  it("requires an exact permission code membership", () => {
    expect(hasPermission(scopedAdmin, permissions.adminMembers)).toBe(true);
    expect(hasPermission(scopedAdmin, permissions.auditRead)).toBe(true);
    expect(hasPermission(scopedAdmin, permissions.retentionManage)).toBe(false);
  });

  it("is deny-by-default for missing or anonymous sessions", () => {
    expect(hasPermission(null, permissions.adminMembers)).toBe(false);
    expect(hasPermission(undefined, permissions.adminMembers)).toBe(false);
    expect(hasPermission([], permissions.adminMembers)).toBe(false);
  });
});

describe("hasAnyPermission", () => {
  it("matches any required permission", () => {
    expect(
      hasAnyPermission(scopedAdmin, [
        permissions.retentionManage,
        permissions.auditRead,
      ]),
    ).toBe(true);
  });

  it("fails closed when no permission matches", () => {
    expect(
      hasAnyPermission(scopedAdmin, [permissions.retentionManage]),
    ).toBe(false);
  });

  it("never grants based on an empty capability list", () => {
    expect(hasAnyPermission([], [permissions.adminMembers])).toBe(false);
    expect(hasAnyPermission(null, [permissions.adminMembers])).toBe(false);
  });
});

describe("canAccessAnyAdmin", () => {
  it("is satisfied only by admin-area capabilities", () => {
    expect(canAccessAnyAdmin(scopedAdmin)).toBe(true);
    expect(canAccessAnyAdmin([permissions.leaveCreate])).toBe(false);
    expect(canAccessAnyAdmin(null)).toBe(false);
  });
});
