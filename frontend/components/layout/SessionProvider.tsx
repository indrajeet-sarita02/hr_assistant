"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ApiError, apiGet } from "@/lib/api-client";
import type { Me } from "@/lib/types";

type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface SessionContextValue {
  me: Me | null;
  status: SessionStatus;
  error: unknown;
  login: (email: string, password: string) => Promise<Me>;
  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    locale: string;
  }) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadMe(): Promise<Me> {
  return apiGet<Me>("/me", {
    suppressUnauthorizedEvent: true,
    timeoutMs: 15000,
  });
}

export function SessionProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession: boolean;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<SessionStatus>(
    initialSession ? "loading" : "unauthenticated",
  );
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const current = await loadMe();
      if (!mounted.current) return;
      setMe(current);
      setStatus("authenticated");
    } catch (caught) {
      if (!mounted.current) return;
      setMe(null);
      if (caught instanceof ApiError && caught.status === 401) {
        setStatus("unauthenticated");
      } else {
        setError(caught);
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    if (initialSession) void refresh();
  }, [initialSession, refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      setMe(null);
      setStatus("unauthenticated");
      setError(null);
    };
    window.addEventListener("hr:unauthorized", onUnauthorized);
    return () => window.removeEventListener("hr:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!response.ok) {
      let envelope = null;
      try {
        envelope = await response.json();
      } catch {
        envelope = null;
      }
      throw new ApiError(response.status, envelope);
    }

    const current = await loadMe();
    setMe(current);
    setStatus("authenticated");
    setError(null);
    return current;
  }, []);

  const register = useCallback(
    async (payload: {
      email: string;
      password: string;
      full_name: string;
      locale: string;
    }) => {
      const response = await fetch("/api/session/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        let envelope = null;
        try {
          envelope = await response.json();
        } catch {
          envelope = null;
        }
        throw new ApiError(response.status, envelope);
      }

      const current = await loadMe();
      setMe(current);
      setStatus("authenticated");
      setError(null);
      return current;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/session/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      setMe(null);
      setStatus("unauthenticated");
      setError(null);
      window.dispatchEvent(new CustomEvent("hr:session-changed"));
    }
  }, []);

  const value = useMemo(
    () => ({ me, status, error, login, register, logout, refresh }),
    [me, status, error, login, register, logout, refresh],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return context;
}
