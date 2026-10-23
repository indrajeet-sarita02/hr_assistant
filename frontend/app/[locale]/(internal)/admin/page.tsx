"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  KeyRound,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Workflow,
  X,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { DataTable } from "@/components/ui/DataTable";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingPanel, Spinner } from "@/components/ui/States";
import { apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import {
  canAccessAnyAdmin,
  hasAnyPermission,
  hasPermission,
  permissions,
} from "@/lib/permissions";
import type {
  AdminMembership,
  ApprovalRule,
  CatalogItem,
  DeletionRequest,
  LeaveType,
  Page,
  ReminderRule,
  Role,
  TenantSettings,
} from "@/lib/types";

type Tab = "overview" | "members" | "policy" | "settings" | "retention";

function today(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export default function AdminPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const perms = me?.permissions;
  const canMembers = hasPermission(perms, permissions.adminMembers);
  const canSettings = hasPermission(perms, permissions.adminSettings);
  const canWorkflow = hasPermission(perms, permissions.adminWorkflow);
  const canLeaveTypes = hasPermission(perms, permissions.leaveTypeManage);
  const canRetention = hasPermission(perms, permissions.retentionManage);
  const canLegalHold = hasPermission(perms, permissions.legalHoldManage);
  const [tab, setTab] = useState<Tab>("overview");
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const [memberships, roles, settings, leaveTypes, catalog, rules, reminders, deletions] =
      await Promise.all([
        canMembers
          ? apiGet<Page<AdminMembership>>("/admin/memberships?limit=100")
          : Promise.resolve(null),
        canMembers ? apiGet<Role[]>("/admin/roles") : Promise.resolve(null),
        canSettings ? apiGet<TenantSettings>("/admin/settings") : Promise.resolve(null),
        canLeaveTypes ? apiGet<LeaveType[]>("/admin/leave-types") : Promise.resolve(null),
        canWorkflow
          ? apiGet<CatalogItem[]>("/admin/service-catalog")
          : Promise.resolve(null),
        canWorkflow
          ? apiGet<ApprovalRule[]>("/admin/approval-rules")
          : Promise.resolve(null),
        canWorkflow
          ? apiGet<ReminderRule[]>("/admin/reminder-rules")
          : Promise.resolve(null),
        canRetention
          ? apiGet<Page<DeletionRequest>>("/admin/deletion-requests?limit=100")
          : Promise.resolve(null),
      ]);
    return {
      memberships,
      roles,
      settings,
      leaveTypes,
      catalog,
      rules,
      reminders,
      deletions,
    };
  }, [canMembers, canSettings, canLeaveTypes, canWorkflow, canRetention]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRoles, setInviteRoles] = useState<string[]>([]);
  const [editingMember, setEditingMember] = useState<AdminMembership | null>(
    null,
  );
  const [memberRoleIds, setMemberRoleIds] = useState<string[]>([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveCode, setLeaveCode] = useState("");
  const [leaveNameEn, setLeaveNameEn] = useState("");
  const [leaveNameHi, setLeaveNameHi] = useState("");
  const [leaveUnit, setLeaveUnit] = useState("days");
  const [leaveHalf, setLeaveHalf] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogCode, setCatalogCode] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogNameHi, setCatalogNameHi] = useState("");
  const [catalogSla, setCatalogSla] = useState("24");
  const [settingsName, setSettingsName] = useState<string | null>(null);
  const [settingsLocale, setSettingsLocale] = useState<string | null>(null);
  const [settingsTimezone, setSettingsTimezone] = useState<string | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<DeletionRequest | null>(
    null,
  );
  const [decisionComment, setDecisionComment] = useState("");
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdTargetType, setHoldTargetType] = useState("employee");
  const [holdTargetId, setHoldTargetId] = useState("");
  const [holdReason, setHoldReason] = useState("");

  const tabs = useMemo(() => {
    const list: Array<{ key: Tab; label: string; icon: typeof Users }> = [
      { key: "overview", label: t("admin.overview"), icon: ShieldCheck },
    ];
    if (canMembers)
      list.push({ key: "members", label: t("admin.members"), icon: Users });
    if (canWorkflow || canLeaveTypes)
      list.push({ key: "policy", label: t("admin.workflow"), icon: Workflow });
    if (canSettings)
      list.push({ key: "settings", label: t("admin.org_settings"), icon: Settings2 });
    if (canRetention)
      list.push({ key: "retention", label: t("admin.retention"), icon: Trash2 });
    return list;
  }, [canMembers, canRetention, canSettings, canWorkflow, canLeaveTypes, t]);

  const roles = data?.roles ?? [];
  const settings = data?.settings;

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("invite");
    setActionError(null);
    try {
      await apiFetch("/admin/memberships", {
        method: "POST",
        json: {
          email: inviteEmail.trim(),
          full_name: inviteName.trim() || null,
          temporary_password: invitePassword || null,
          role_ids: inviteRoles,
        },
      });
      notify(t("admin.member_invited"));
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
      setInviteRoles([]);
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function saveRoles() {
    if (!editingMember) return;
    setWorking("roles");
    setActionError(null);
    try {
      await apiFetch(`/admin/memberships/${editingMember.id}/roles`, {
        method: "PUT",
        json: { role_ids: memberRoleIds },
      });
      notify(t("admin.settings_saved"));
      setEditingMember(null);
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function setStatus(member: AdminMembership, status: string) {
    setWorking(`status-${member.id}`);
    setActionError(null);
    try {
      await apiFetch(`/admin/memberships/${member.id}`, {
        method: "PATCH",
        json: { status },
      });
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function createLeaveType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("leave-type");
    setActionError(null);
    try {
      await apiFetch("/admin/leave-types", {
        method: "POST",
        json: {
          code: leaveCode.trim(),
          name_en: leaveNameEn.trim(),
          name_hi: leaveNameHi.trim() || null,
          unit: leaveUnit,
          requires_approval: true,
          allow_half_day: leaveHalf,
          active: true,
        },
      });
      notify(t("admin.settings_saved"));
      setLeaveOpen(false);
      setLeaveCode("");
      setLeaveNameEn("");
      setLeaveNameHi("");
      setLeaveHalf(false);
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function createCatalogItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("catalog");
    setActionError(null);
    try {
      await apiFetch("/admin/service-catalog", {
        method: "POST",
        json: {
          code: catalogCode.trim(),
          name_en: catalogName.trim(),
          name_hi: catalogNameHi.trim() || null,
          description: null,
          form_schema: { properties: {} },
          sla_hours: Number(catalogSla),
          queue_code: "hr",
          active: true,
        },
      });
      notify(t("admin.settings_saved"));
      setCatalogOpen(false);
      setCatalogCode("");
      setCatalogName("");
      setCatalogNameHi("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setWorking("settings");
    setActionError(null);
    try {
      await apiFetch("/admin/settings", {
        method: "PATCH",
        json: {
          name: settingsName ?? settings.name,
          default_locale: settingsLocale ?? settings.default_locale,
          timezone: settingsTimezone ?? settings.timezone,
          settings: settings.settings,
          version: settings.version,
        },
      });
      notify(t("admin.settings_saved"));
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function decideDeletion(decision: "approved" | "rejected") {
    if (!decisionTarget) return;
    setWorking(`deletion-${decisionTarget.id}`);
    setActionError(null);
    try {
      await apiFetch(
        `/admin/deletion-requests/${decisionTarget.id}/decision`,
        {
          method: "POST",
          json: { decision, comment: decisionComment.trim() || null },
        },
      );
      notify(
        decision === "approved"
          ? t("admin.deletion_approved")
          : t("admin.deletion_rejected"),
      );
      setDecisionTarget(null);
      setDecisionComment("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function applyLegalHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("hold");
    setActionError(null);
    try {
      await apiFetch("/admin/legal-holds", {
        method: "POST",
        json: {
          target_type: holdTargetType,
          target_id: holdTargetId.trim(),
          reason: holdReason.trim(),
        },
      });
      notify(t("admin.legal_hold_applied"));
      setHoldOpen(false);
      setHoldTargetId("");
      setHoldReason("");
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  if (!canAccessAnyAdmin(perms)) {
    return (
      <div className="page">
        <PageHeader
          title={t("state.forbidden_title")}
          description={t("state.forbidden_body")}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingPanel label={t("app.loading")} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader title={t("state.error_title")} description={t("state.error_body")} />
        <button type="button" className="btn btn-secondary" onClick={() => reload()}>
          <RefreshCw size={15} aria-hidden="true" />
          {t("app.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t("admin.overview")}
        description={t("admin.overview_body")}
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => reload()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t("app.refresh")}
          </button>
        }
      />

      <div className="admin-tabs" role="tablist" aria-label={t("admin.overview")}>
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={`admin-tab${tab === item.key ? " is-active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              <Icon size={15} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      {Boolean(actionError) && (
        <div className="mb-3">
          <Alert tone="error" title={t("state.error_title")}>
            {errorMessage(actionError, t)}
          </Alert>
        </div>
      )}

      {tab === "overview" && (
        <div className="stack">
          <div className="grid grid-3">
            <article className="card card-pad">
              <span className="feature-icon">
                <Users size={18} aria-hidden="true" />
              </span>
              <h2 className="section-title mt-2">{t("admin.members_title")}</h2>
              <p className="small muted mt-1">{t("admin.members_body")}</p>
              <div className="row-between mt-3">
                <span className="badge badge-neutral">
                  {data?.memberships?.total ?? 0}
                </span>
                {canMembers && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTab("members")}
                  >
                    {t("app.view_all")}
                  </button>
                )}
              </div>
            </article>
            <article className="card card-pad">
              <span className="feature-icon">
                <Workflow size={18} aria-hidden="true" />
              </span>
              <h2 className="section-title mt-2">{t("admin.service_catalog_title")}</h2>
              <p className="small muted mt-1">{t("admin.service_catalog_body")}</p>
              <div className="row-between mt-3">
                <span className="badge badge-neutral">
                  {data?.catalog?.length ?? 0}
                </span>
                {(canWorkflow || canLeaveTypes) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTab("policy")}
                  >
                    {t("app.view_all")}
                  </button>
                )}
              </div>
            </article>
            <article className="card card-pad">
              <span className="feature-icon">
                <Trash2 size={18} aria-hidden="true" />
              </span>
              <h2 className="section-title mt-2">{t("admin.retention_title")}</h2>
              <p className="small muted mt-1">{t("admin.retention_body")}</p>
              <div className="row-between mt-3">
                <span className="badge badge-neutral">
                  {data?.deletions?.total ?? 0}
                </span>
                {canRetention && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTab("retention")}
                  >
                    {t("app.view_all")}
                  </button>
                )}
              </div>
            </article>
          </div>

          <div className="split">
            <div className="aside-card">
              <h3>
                <ShieldCheck
                  size={13}
                  aria-hidden="true"
                  style={{ display: "inline", marginRight: 5 }}
                />
                {t("admin.minimum_role")}
              </h3>
              <p>{t("admin.overview_body")}</p>
            </div>
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>{t("admin.roles_title")}</h2>
                  <p>{t("admin.roles_body")}</p>
                </div>
                <span className="badge badge-neutral">{roles.length}</span>
              </div>
              <div className="card-body">
                {roles.length === 0 ? (
                  <p className="small muted">{t("admin.access_denied")}</p>
                ) : (
                  <div className="stack-sm">
                    {roles.slice(0, 6).map((role) => (
                      <div className="row-between" key={role.id}>
                        <div>
                          <div className="small" style={{ fontWeight: 650 }}>
                            {role.name}
                          </div>
                          <div className="tiny muted">{role.code}</div>
                        </div>
                        <span className="badge badge-neutral">
                          {t("admin.role_permissions", {
                            count: role.permissions.length,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === "members" && canMembers && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t("admin.members_title")}</h2>
              <p>{t("admin.members_body")}</p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus size={15} aria-hidden="true" />
              {t("admin.invite_member")}
            </button>
          </div>
          <DataTable
            caption={t("admin.members_title")}
            rows={data?.memberships?.items ?? []}
            getKey={(row) => row.id}
            empty={<p className="small muted">{t("admin.no_sections")}</p>}
            columns={[
              {
                key: "member",
                label: t("admin.members"),
                render: (row) => (
                  <div>
                    <div className="small" style={{ fontWeight: 650 }}>
                      {row.user?.full_name || row.user?.email || shortReference(row.user_id)}
                    </div>
                    <div className="tiny muted">
                      {row.user?.email || shortReference(row.user_id)}
                    </div>
                  </div>
                ),
              },
              {
                key: "roles",
                label: t("admin.member_roles"),
                render: (row) => (
                  <div className="row wrap">
                    {row.roles.length ? (
                      row.roles.map((role) => (
                        <span className="badge badge-neutral" key={role}>
                          {role}
                        </span>
                      ))
                    ) : (
                      <span className="tiny muted">{t("app.none")}</span>
                    )}
                  </div>
                ),
              },
              {
                key: "status",
                label: t("admin.member_status"),
                render: (row) => <StatusBadge status={row.status} />,
              },
              {
                key: "joined",
                label: t("admin.audit_time"),
                render: (row) => (
                  <span className="tiny muted">
                    {formatDate(row.created_at, locale)}
                  </span>
                ),
              },
              {
                key: "actions",
                label: t("actions.edit"),
                render: (row) => (
                  <div className="row wrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditingMember(row);
                        setMemberRoleIds(
                          roles
                            .filter((role) => row.roles.includes(role.code))
                            .map((role) => role.id),
                        );
                      }}
                    >
                      <KeyRound size={12} aria-hidden="true" />
                      {t("admin.member_roles")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={working === `status-${row.id}`}
                      onClick={() =>
                        void setStatus(
                          row,
                          row.status === "active" ? "suspended" : "active",
                        )
                      }
                    >
                      {row.status === "active"
                        ? t("admin.member_suspended")
                        : t("admin.member_active")}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}

      {tab === "policy" && (canWorkflow || canLeaveTypes) && (
        <div className="stack">
          {canLeaveTypes && (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>{t("admin.leave_types_title")}</h2>
                  <p>{t("admin.leave_types_body")}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setLeaveOpen(true)}
                >
                  <Plus size={14} aria-hidden="true" />
                  {t("admin.new_leave_type")}
                </button>
              </div>
              <DataTable
                caption={t("admin.leave_types_title")}
                rows={data?.leaveTypes ?? []}
                getKey={(row) => row.id}
                columns={[
                  {
                    key: "name",
                    label: t("admin.leave_name_en"),
                    render: (row) => (
                      <div>
                        <div className="small" style={{ fontWeight: 650 }}>
                          {row.name_en}
                        </div>
                        <div className="tiny muted">
                          {row.code} · {row.unit}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "half",
                    label: t("admin.allow_half_day"),
                    render: (row) => (
                      <span className="tiny muted">
                        {row.allow_half_day ? t("app.yes") : t("app.no")}
                      </span>
                    ),
                  },
                  {
                    key: "active",
                    label: t("admin.member_status"),
                    render: (row) => (
                      <StatusBadge status={row.active ? "active" : "inactive"} />
                    ),
                  },
                ]}
              />
            </section>
          )}

          {canWorkflow && (
            <>
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2>{t("admin.service_catalog_title")}</h2>
                    <p>{t("admin.service_catalog_body")}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCatalogOpen(true)}
                  >
                    <Plus size={14} aria-hidden="true" />
                    {t("admin.new_catalog_item")}
                  </button>
                </div>
                <DataTable
                  caption={t("admin.service_catalog_title")}
                  rows={data?.catalog ?? []}
                  getKey={(row) => row.id}
                  columns={[
                    {
                      key: "name",
                      label: t("admin.catalog_name"),
                      render: (row) => (
                        <div>
                          <div className="small" style={{ fontWeight: 650 }}>
                            {row.name_en}
                          </div>
                          <div className="tiny muted">{row.code}</div>
                        </div>
                      ),
                    },
                    {
                      key: "sla",
                      label: t("admin.catalog_sla"),
                      render: (row) => (
                        <span className="tiny muted">{row.sla_hours}h</span>
                      ),
                    },
                    {
                      key: "queue",
                      label: t("admin.catalog_queue"),
                      render: (row) => (
                        <span className="badge badge-neutral">{row.queue_code}</span>
                      ),
                    },
                  ]}
                />
              </section>

              <div className="split">
                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2>{t("admin.approval_rules_title")}</h2>
                      <p>{t("admin.approval_rules_body")}</p>
                    </div>
                  </div>
                  <div className="card-body stack-sm">
                    {(data?.rules ?? []).length === 0 ? (
                      <p className="small muted">{t("app.not_available")}</p>
                    ) : (
                      (data?.rules ?? []).map((rule) => (
                        <div className="row-between" key={rule.id}>
                          <div>
                            <div className="small" style={{ fontWeight: 650 }}>
                              {rule.name}
                            </div>
                            <div className="tiny muted">
                              {rule.code} · v{rule.version} ·{" "}
                              {t("admin.steps", { count: rule.steps.length })}
                            </div>
                          </div>
                          <StatusBadge status={rule.active ? "active" : "inactive"} />
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2>{t("admin.workflow")}</h2>
                      <p>{t("admin.approval_rules_body")}</p>
                    </div>
                  </div>
                  <div className="card-body stack-sm">
                    {(data?.reminders ?? []).length === 0 ? (
                      <p className="small muted">{t("app.not_available")}</p>
                    ) : (
                      (data?.reminders ?? []).map((reminder) => (
                        <div className="row-between" key={reminder.id}>
                          <div>
                            <div className="small" style={{ fontWeight: 650 }}>
                              {reminder.name}
                            </div>
                            <div className="tiny muted">
                              {reminder.entity_type} · {reminder.offset_hours}h ·{" "}
                              {reminder.channel}
                            </div>
                          </div>
                          <StatusBadge
                            status={reminder.active ? "active" : "inactive"}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "settings" && canSettings && settings && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t("admin.org_settings")}</h2>
              <p>{t("admin.org_settings_body")}</p>
            </div>
            <span className="badge badge-neutral">v{settings.version}</span>
          </div>
          <form className="card-body stack" onSubmit={saveSettings}>
            <Field label={t("admin.org_name")} htmlFor="settings-name" required>
              <input
                id="settings-name"
                className="input"
                value={settingsName ?? settings.name}
                onChange={(event) => setSettingsName(event.target.value)}
                required
              />
            </Field>
            <div className="form-grid">
              <Field
                label={t("admin.default_locale")}
                htmlFor="settings-locale"
              >
                <select
                  id="settings-locale"
                  className="select"
                  value={settingsLocale ?? settings.default_locale}
                  onChange={(event) => setSettingsLocale(event.target.value)}
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                </select>
              </Field>
              <Field label={t("admin.timezone")} htmlFor="settings-timezone">
                <input
                  id="settings-timezone"
                  className="input"
                  value={settingsTimezone ?? settings.timezone}
                  onChange={(event) => setSettingsTimezone(event.target.value)}
                />
              </Field>
            </div>
            <div className="row">
              <span className="spacer" />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={working === "settings"}
              >
                {working === "settings" ? <Spinner light /> : <Check size={15} />}
                {t("actions.save_changes")}
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === "retention" && canRetention && (
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t("admin.deletion_requests")}</h2>
                <p>{t("admin.retention_body")}</p>
              </div>
              {canLegalHold && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setHoldOpen(true)}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  {t("admin.legal_hold")}
                </button>
              )}
            </div>
            <DataTable
              caption={t("admin.deletion_requests")}
              rows={data?.deletions?.items ?? []}
              getKey={(row) => row.id}
              columns={[
                {
                  key: "subject",
                  label: t("admin.subject_type"),
                  render: (row) => (
                    <div>
                      <div className="small" style={{ fontWeight: 650 }}>
                        {row.subject_type}
                      </div>
                      <div className="tiny muted">
                        {shortReference(row.subject_id)}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: t("requests.status"),
                  render: (row) => <StatusBadge status={row.status} />,
                },
                {
                  key: "created",
                  label: t("admin.audit_time"),
                  render: (row) => (
                    <span className="tiny muted">
                      {formatDateTime(row.created_at, locale)}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  label: t("actions.decide"),
                  render: (row) =>
                    row.status === "pending" ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDecisionTarget(row)}
                      >
                        {t("actions.decide")}
                      </button>
                    ) : (
                      <span className="tiny muted">{t("app.none")}</span>
                    ),
                },
              ]}
            />
          </section>
          <div className="aside-card">
            <h3>{t("admin.legal_hold")}</h3>
            <p>{t("admin.retention_body")}</p>
          </div>
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t("admin.invite_member")}
        description={t("admin.members_body")}
        closeLabel={t("app.close")}
      >
        <form onSubmit={invite} className="stack">
          <Field label={t("admin.member_email")} htmlFor="invite-email" required>
            <input
              id="invite-email"
              type="email"
              className="input"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
            />
          </Field>
          <Field label={t("admin.member_name")} htmlFor="invite-name">
            <input
              id="invite-name"
              className="input"
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
            />
          </Field>
          <Field
            label={t("admin.temporary_password")}
            htmlFor="invite-password"
            hint={t("admin.temporary_password_hint")}
          >
            <input
              id="invite-password"
              type="password"
              className="input"
              value={invitePassword}
              onChange={(event) => setInvitePassword(event.target.value)}
              minLength={12}
              autoComplete="new-password"
            />
          </Field>
          <fieldset>
            <legend className="field-label">{t("admin.member_roles")}</legend>
            <div className="check-grid">
              {roles.map((role) => (
                <label className="checkbox-row" key={role.id}>
                  <input
                    type="checkbox"
                    checked={inviteRoles.includes(role.id)}
                    onChange={(event) =>
                      setInviteRoles((current) =>
                        event.target.checked
                          ? [...current, role.id]
                          : current.filter((id) => id !== role.id),
                      )
                    }
                  />
                  <span className="small">{role.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={working === "invite"}
          >
            {working === "invite" ? <Spinner light /> : <UserPlus size={15} />}
            {t("admin.invite_member")}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={t("admin.member_roles")}
        description={editingMember?.user?.email}
        closeLabel={t("app.close")}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditingMember(null)}
            >
              {t("app.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={working === "roles"}
              onClick={() => void saveRoles()}
            >
              {working === "roles" ? <Spinner light /> : <Check size={15} />}
              {t("actions.save_changes")}
            </button>
          </>
        }
      >
        <div className="check-grid">
          {roles.map((role) => (
            <label className="checkbox-row" key={role.id}>
              <input
                type="checkbox"
                checked={memberRoleIds.includes(role.id)}
                onChange={(event) =>
                  setMemberRoleIds((current) =>
                    event.target.checked
                      ? [...current, role.id]
                      : current.filter((id) => id !== role.id),
                  )
                }
              />
              <span className="small">{role.name}</span>
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t("admin.new_leave_type")}
        description={t("admin.leave_types_body")}
        closeLabel={t("app.close")}
      >
        <form onSubmit={createLeaveType} className="stack">
          <div className="form-grid">
            <Field label={t("admin.leave_code")} htmlFor="leave-code" required>
              <input
                id="leave-code"
                className="input"
                value={leaveCode}
                onChange={(event) => setLeaveCode(event.target.value)}
                required
                minLength={2}
                maxLength={40}
              />
            </Field>
            <Field label={t("admin.leave_unit")} htmlFor="leave-unit">
              <select
                id="leave-unit"
                className="select"
                value={leaveUnit}
                onChange={(event) => setLeaveUnit(event.target.value)}
              >
                <option value="days">{t("app.days")}</option>
                <option value="hours">{t("app.hours")}</option>
              </select>
            </Field>
          </div>
          <Field
            label={t("admin.leave_name_en")}
            htmlFor="leave-name-en"
            required
          >
            <input
              id="leave-name-en"
              className="input"
              value={leaveNameEn}
              onChange={(event) => setLeaveNameEn(event.target.value)}
              required
            />
          </Field>
          <Field label={t("admin.leave_name_hi")} htmlFor="leave-name-hi">
            <input
              id="leave-name-hi"
              className="input"
              value={leaveNameHi}
              onChange={(event) => setLeaveNameHi(event.target.value)}
            />
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={leaveHalf}
              onChange={(event) => setLeaveHalf(event.target.checked)}
            />
            <span className="small">{t("admin.allow_half_day")}</span>
          </label>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={working === "leave-type"}
          >
            {working === "leave-type" ? <Spinner light /> : <Plus size={15} />}
            {t("actions.create")}
          </button>
        </form>
      </Modal>

      <Modal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title={t("admin.new_catalog_item")}
        description={t("admin.service_catalog_body")}
        closeLabel={t("app.close")}
      >
        <form onSubmit={createCatalogItem} className="stack">
          <Field label={t("admin.catalog_code")} htmlFor="catalog-code" required>
            <input
              id="catalog-code"
              className="input"
              value={catalogCode}
              onChange={(event) => setCatalogCode(event.target.value)}
              required
            />
          </Field>
          <div className="form-grid">
            <Field
              label={t("admin.catalog_name")}
              htmlFor="catalog-name"
              required
            >
              <input
                id="catalog-name"
                className="input"
                value={catalogName}
                onChange={(event) => setCatalogName(event.target.value)}
                required
              />
            </Field>
            <Field
              label={t("admin.catalog_name_hi")}
              htmlFor="catalog-name-hi"
            >
              <input
                id="catalog-name-hi"
                className="input"
                value={catalogNameHi}
                onChange={(event) => setCatalogNameHi(event.target.value)}
              />
            </Field>
          </div>
          <Field label={t("admin.catalog_sla")} htmlFor="catalog-sla">
            <input
              id="catalog-sla"
              type="number"
              min={1}
              max={720}
              className="input"
              value={catalogSla}
              onChange={(event) => setCatalogSla(event.target.value)}
            />
          </Field>
          <Alert tone="info" title={t("admin.catalog_required_field")}>
            {t("admin.service_catalog_body")}
          </Alert>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={working === "catalog"}
          >
            {working === "catalog" ? <Spinner light /> : <Plus size={15} />}
            {t("actions.create")}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(decisionTarget)}
        onClose={() => setDecisionTarget(null)}
        title={t("admin.decision")}
        description={decisionTarget?.subject_type}
        closeLabel={t("app.close")}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setDecisionTarget(null)}
            >
              {t("app.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={Boolean(working)}
              onClick={() => void decideDeletion("rejected")}
            >
              <X size={15} aria-hidden="true" />
              {t("actions.reject")}
            </button>
            <button
              type="button"
              className="btn btn-success"
              disabled={Boolean(working)}
              onClick={() => void decideDeletion("approved")}
            >
              <Check size={15} aria-hidden="true" />
              {t("actions.approve")}
            </button>
          </>
        }
      >
        <Field label={t("admin.decision_reason")} htmlFor="decision-reason">
          <textarea
            id="decision-reason"
            className="textarea"
            rows={4}
            value={decisionComment}
            onChange={(event) => setDecisionComment(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title={t("admin.legal_hold")}
        description={t("admin.retention_body")}
        closeLabel={t("app.close")}
      >
        <form onSubmit={applyLegalHold} className="stack">
          <Field label={t("admin.subject_type")} htmlFor="hold-type" required>
            <input
              id="hold-type"
              className="input"
              value={holdTargetType}
              onChange={(event) => setHoldTargetType(event.target.value)}
              required
            />
          </Field>
          <Field
            label={t("admin.subject_id")}
            htmlFor="hold-id"
            required
          >
            <input
              id="hold-id"
              className="input"
              value={holdTargetId}
              onChange={(event) => setHoldTargetId(event.target.value)}
              required
            />
          </Field>
          <Field
            label={t("admin.legal_hold_reason")}
            htmlFor="hold-reason"
            required
          >
            <textarea
              id="hold-reason"
              className="textarea"
              rows={3}
              value={holdReason}
              onChange={(event) => setHoldReason(event.target.value)}
              required
              minLength={2}
            />
          </Field>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={working === "hold"}
          >
            {working === "hold" ? <Spinner light /> : <ShieldCheck size={15} />}
            {t("admin.legal_hold")}
          </button>
        </form>
      </Modal>
    </div>
  );
}
