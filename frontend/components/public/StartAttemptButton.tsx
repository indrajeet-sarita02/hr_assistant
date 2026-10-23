"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, Play } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/States";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { Attempt } from "@/lib/types";

export function StartAttemptButton({ testId }: { testId: string }) {
  const { locale, t } = useI18n();
  const { me, status } = useSession();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (status === "loading") {
    return (
      <button type="button" className="btn btn-primary" disabled>
        <Spinner light />
        {t("app.loading")}
      </button>
    );
  }

  if (!me) {
    return (
      <div className="stack-sm">
        <Alert tone="info" title={t("public.mock_signin_required")}>
          {t("public.mock_intro")}
        </Alert>
        <Link
          className="btn btn-primary"
          href={`/${locale}/sign-in?next=/${locale}/mock-tests/${testId}`}
        >
          {t("actions.sign_in")}
        </Link>
      </div>
    );
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const attempt = await apiFetch<Attempt>(`/mock-tests/${testId}/attempts`, {
        method: "POST",
        json: {},
      });
      router.push(`/${locale}/mock-tests/attempt/${attempt.id}`);
    } catch (caught) {
      setError(caught);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="stack-sm">
      {Boolean(error) && (
        <Alert tone="error" title={t("state.error_title")}>
          {errorMessage(error, t)}
        </Alert>
      )}
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => void start()}
        disabled={starting}
      >
        {starting ? <Spinner light /> : <Play size={16} aria-hidden="true" />}
        {starting ? t("public.mock_starting") : t("public.mock_start")}
      </button>
      <span className="tiny muted">
        <Clock3
          size={11}
          aria-hidden="true"
          style={{ display: "inline", marginRight: 4 }}
        />
        {t("public.mock_rule_timer")}
      </span>
    </div>
  );
}
