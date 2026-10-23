import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareText,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { canAccessAnyAdmin, hasAnyPermission, permissions } from "./permissions";

export interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
  anyPermissions?: string[];
}

export interface NavGroup {
  key: string;
  items: NavItem[];
}

export const workspaceNav: NavGroup[] = [
  {
    key: "nav.workspace",
    items: [
      {
        href: "/dashboard",
        key: "nav.dashboard",
        icon: LayoutDashboard,
      },
      {
        href: "/assistant",
        key: "nav.assistant",
        icon: MessageSquareText,
        anyPermissions: [permissions.assistant],
      },
      {
        href: "/requests",
        key: "nav.requests",
        icon: LifeBuoy,
        anyPermissions: [
          permissions.serviceCreate,
          permissions.serviceReadOwn,
          permissions.serviceReadQueue,
          permissions.serviceUpdate,
        ],
      },
      {
        href: "/leave",
        key: "nav.leave",
        icon: CalendarDays,
        anyPermissions: [
          permissions.leaveCreate,
          permissions.leaveReadOwn,
          permissions.leaveReadScope,
          permissions.leaveDecide,
        ],
      },
      {
        href: "/notifications",
        key: "nav.notifications",
        icon: Bell,
        anyPermissions: [permissions.notificationRead],
      },
    ],
  },
  {
    key: "nav.operations",
    items: [
      {
        href: "/onboarding",
        key: "nav.onboarding",
        icon: UserPlus,
        anyPermissions: [permissions.onboardingRead, permissions.onboardingTask],
      },
      {
        href: "/recruitment",
        key: "nav.recruitment",
        icon: BriefcaseBusiness,
        anyPermissions: [
          permissions.recruitmentManage,
          permissions.recruitmentApprove,
          permissions.recruitmentApplications,
        ],
      },
      {
        href: "/resume",
        key: "nav.resume",
        icon: FileText,
        anyPermissions: [permissions.resumeManage],
      },
    ],
  },
  {
    key: "nav.insights",
    items: [
      {
        href: "/reports",
        key: "nav.reports",
        icon: BarChart3,
        anyPermissions: [permissions.reportRead],
      },
      {
        href: "/audit",
        key: "nav.audit",
        icon: ScrollText,
        anyPermissions: [permissions.auditRead],
      },
    ],
  },
  {
    key: "nav.content",
    items: [
      {
        href: "/editorial",
        key: "nav.content",
        icon: BookOpen,
        anyPermissions: [
          permissions.contentEdit,
          permissions.contentReview,
          permissions.contentPublish,
          permissions.contentReportTriage,
        ],
      },
    ],
  },
];

export const adminNavItem: NavItem = {
  href: "/admin",
  key: "nav.admin",
  icon: Settings2,
};

export function visibleGroups(
  perms: string[] | null | undefined,
): NavGroup[] {
  const groups = workspaceNav
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !item.anyPermissions ||
          hasAnyPermission(perms, item.anyPermissions),
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (canAccessAnyAdmin(perms)) {
    const adminGroup = groups.find((group) => group.key === "nav.workspace");
    if (adminGroup) adminGroup.items.push(adminNavItem);
    else groups.push({ key: "nav.workspace", items: [adminNavItem] });
  }
  return groups;
}

export function visibleItems(perms: string[] | null | undefined): NavItem[] {
  return visibleGroups(perms).flatMap((group) => group.items);
}

export function pageForPath(path: string, perms: string[] | null | undefined): NavItem | null {
  const items = visibleItems(perms);
  return (
    items
      .filter((item) => path === item.href || path.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

export function canOpenWorkspace(perms: string[] | null | undefined): boolean {
  return (
    canAccessAnyAdmin(perms) ||
    hasAnyPermission(perms, [
      permissions.assistant,
      permissions.serviceCreate,
      permissions.leaveCreate,
      permissions.leaveReadOwn,
      permissions.onboardingRead,
      permissions.recruitmentApplications,
      permissions.reportRead,
      permissions.notificationRead,
      permissions.resumeManage,
      permissions.assessmentOwn,
      permissions.contentEdit,
    ])
  );
}

export const workspaceShield = ShieldCheck;
