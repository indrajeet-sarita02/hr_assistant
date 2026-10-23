"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  Check,
  Mail,
  MessageSquare,
  Smartphone,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCards } from "@/components/ui/States";
import { apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type {
  Notification,
  NotificationPreference,
  Page,
} from "@/lib/types";

const channels = [
  { key: "in_app", icon: Bell },
  { key: "email", icon: Mail },
  { key: "sms", icon: Smartphone },
] as const;

export default function NotificationsPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const [tab, setTab] = useState<"inbox" | "preferences">("inbox");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [prefDraft, setPrefDraft] = useState<Record<string, boolean> | null>(
    null,
  );

  const { data, loading, error, reload } = useAsync(async () => {
    const [inbox, preferenceResponse] = await Promise.all([
      apiGet<Page<Notification>>(
        `/me/notifications?limit=100${unreadOnly ? "&unread_only=true" : ""}`,
      ),
      apiGet<NotificationPreference[] | { items: NotificationPreference[] }>(
        "/me/notification-preferences",
      ).catch(() => []),
    ]);
    const preferences = Array.isArray(preferenceResponse)
      ? preferenceResponse
      : preferenceResponse.items ?? [];
    return { inbox, preferences };
  }, [unreadOnly]);

  const preferences = useMemo(() => {
    const base: Record<string, boolean> = {
      in_app: true,
      email: false,
      sms: false,
    };
    for (const item of data?.preferences ?? []) base[item.channel] = item.enabled;
    return prefDraft ?? base;
  }, [data?.preferences, prefDraft]);

  const unread = (data?.inbox.items ?? []).filter((item) => !item.read_at);

  async function markRead(notification: Notification) {
    if (notification.read_at) return;
    setWorking(notification.id);
    setActionError(null);
    try {
      await apiFetch(`/me/notifications/${notification.id}`, {
        method: "PATCH",
        json: {},
      });
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function markAllRead() {
    if (!unread.length) {
      notify(t("notifications.no_unread"));
      return;
    }
    setWorking("all");
    setActionError(null);
    try {
      await Promise.all(
        unread.map((item) =>
          apiFetch(`/me/notifications/${item.id}`, {
            method: "PATCH",
            json: {},
          }),
        ),
      );
      notify(t("notifications.all_read"));
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function savePreferences() {
    setWorking("preferences");
    setActionError(null);
    try {
      await apiFetch<NotificationPreference[]>(
        "/me/notification-preferences",
        {
          method: "PUT",
          json: channels.map((channel) => ({
            channel: channel.key,
            enabled: Boolean(preferences[channel.key]),
          })),
        },
      );
      setPrefDraft(null);
      notify(t("notifications.pref_saved"));
      reload();
    } catch (caught) {
      setActionError(caught);
      notify(t("notifications.pref_failed"), "error");
    } finally {
      setWorking(null);
    }
  }

  if (!me?.permissions.includes("notification.read_own")) {
    return (
      <div className="page">
        <PageHeader
          title={t("state.forbidden_title")}
          description={t("state.forbidden_body")}
        />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.subtitle")}
        actions={
          tab === "inbox" && unread.length > 0 ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void markAllRead()}
              disabled={Boolean(working)}
            >
              {working === "all" ? null : <Check size={15} aria-hidden="true" />}
              {t("actions.mark_all_read")}
            </button>
          ) : undefined
        }
      />

      <div className="segmented" role="group" aria-label={t("notifications.title")}>
        <button
          type="button"
          className={`segment${tab === "inbox" ? " is-active" : ""}`}
          aria-pressed={tab === "inbox"}
          onClick={() => setTab("inbox")}
        >
          <Bell size={14} aria-hidden="true" />
          {t("notifications.inbox")}
        </button>
        <button
          type="button"
          className={`segment${tab === "preferences" ? " is-active" : ""}`}
          aria-pressed={tab === "preferences"}
          onClick={() => setTab("preferences")}
        >
          <BellRing size={14} aria-hidden="true" />
          {t("notifications.preferences")}
        </button>
      </div>

      {Boolean(actionError) && (
        <div className="mt-3">
          <Alert tone="error" title={t("state.error_title")}>
            {errorMessage(actionError, t)}
          </Alert>
        </div>
      )}

      {loading ? (
        <SkeletonCards count={3} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : tab === "inbox" ? (
        <section className="card mt-3" aria-labelledby="inbox-title">
          <div className="card-header">
            <div>
              <h2 id="inbox-title">{t("notifications.inbox")}</h2>
              <p>{t("notifications.unread", { count: unread.length })}</p>
            </div>
            <label className="checkbox-row compact">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
              />
              <span className="small">{t("notifications.unread", { count: "" })}</span>
            </label>
          </div>

          {(data?.inbox.items.length ?? 0) === 0 ? (
            <div className="card-body">
              <EmptyState
                icon={Bell}
                title={t("notifications.empty_title")}
                body={t("notifications.empty_body")}
              />
            </div>
          ) : (
            <div className="card-body notification-list">
              {data?.inbox.items.map((notification) => (
                <article
                  className={`notification-item${notification.read_at ? "" : " is-unread"}`}
                  key={notification.id}
                >
                  <span
                    className={`notification-state${notification.read_at ? "" : " is-unread"}`}
                    aria-hidden="true"
                  />
                  <div className="spacer">
                    <div className="row-between">
                      <div className="row wrap">
                        <h3 className="small" style={{ fontWeight: 700 }}>
                          {notification.subject}
                        </h3>
                        {!notification.read_at && (
                          <span className="badge badge-coral">
                            {t("notifications.new")}
                          </span>
                        )}
                      </div>
                      <span className="tiny muted">
                        {formatDateTime(notification.created_at, locale)}
                      </span>
                    </div>
                    <p className="small muted mt-1">{notification.body}</p>
                    <div className="row wrap mt-2">
                      <span className="badge badge-neutral">
                        {notification.channel === "in_app"
                          ? t("notifications.channel_in_app")
                          : notification.channel === "email"
                            ? t("notifications.channel_email")
                            : t("notifications.channel_sms")}
                      </span>
                      {!notification.read_at && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={working === notification.id}
                          onClick={() => void markRead(notification)}
                        >
                          <MessageSquare size={12} aria-hidden="true" />
                          {t("notifications.mark_read")}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="card mt-3">
          <div className="card-header">
            <div>
              <h2>{t("notifications.preferences_title")}</h2>
              <p>{t("notifications.preferences_body")}</p>
            </div>
          </div>
          <div className="card-body stack">
            {channels.map((channel) => {
              const Icon = channel.icon;
              const locked = channel.key === "in_app";
              return (
                <label className="preference-row" key={channel.key}>
                  <span className="feature-icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span className="spacer">
                    <span className="section-title">
                      {t(`notifications.channel_${channel.key}`)}
                    </span>
                    {locked && (
                      <span className="tiny muted">
                        {t("notifications.preferences_body")}
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(preferences[channel.key])}
                    disabled={locked}
                    onChange={(event) =>
                      setPrefDraft({
                        ...preferences,
                        [channel.key]: event.target.checked,
                      })
                    }
                  />
                </label>
              );
            })}

            <div className="row">
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void savePreferences()}
                disabled={working === "preferences"}
              >
                <Check size={15} aria-hidden="true" />
                {t("actions.save_changes")}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
