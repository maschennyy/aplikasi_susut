"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage, APP_LOGIN_PATH, clearCsrfToken, FLASK_LOGIN_PATH, FLASK_LOGOUT_PATH, getCsrfToken } from "@/lib/api";
import type { User } from "@/types";

type AuthState = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  refresh: () => Promise<User | null>;
};

type UseAuthOptions = {
  redirectTo?: string;
  redirectIfFound?: string;
};

type LoginPayload = {
  username: string;
  password: string;
  next?: string;
};

function browserRedirect(path: string) {
  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
}

function loginProbePath() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/flask-api";
  return base.startsWith("/") ? `${base.replace(/\/$/, "")}/me` : "/api/me";
}

export async function getCurrentUser() {
  try {
    const response = await api.get<User>("/me", {
      skipAuthRedirect: true,
      skipCsrf: true,
    });
    return response.data;
  } catch {
    return null;
  }
}

export async function loginWithPassword({ username, password, next }: LoginPayload) {
  const csrfToken = await getCsrfToken({ force: true });
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);
  body.set("next", next || loginProbePath());
  if (csrfToken) body.set("csrf_token", csrfToken);

  const response = await fetch(FLASK_LOGIN_PATH, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "text/html,application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
    },
    body,
  });

  if (response.status === 403) {
    clearCsrfToken();
    throw new Error("CSRF token tidak valid. Muat ulang form login dan coba lagi.");
  }

  const user = await getCurrentUser();
  if (!user) {
    if (response.status === 429) {
      throw new Error("Terlalu banyak percobaan login gagal. Coba lagi beberapa menit lagi.");
    }
    throw new Error("Username atau password tidak sesuai.");
  }

  await getCsrfToken({ force: true });
  return user;
}

export async function logout() {
  const csrfToken = await getCsrfToken();
  await fetch(FLASK_LOGOUT_PATH, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "text/html,application/json",
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
    },
  });
  clearCsrfToken();
  browserRedirect(APP_LOGIN_PATH);
}

export function useAuth(options: UseAuthOptions = {}): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (err) {
      setError(apiErrorMessage(err));
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    getCurrentUser()
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);

        if (!currentUser && options.redirectTo) {
          browserRedirect(options.redirectTo);
        }
        if (currentUser && options.redirectIfFound) {
          browserRedirect(options.redirectIfFound);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(apiErrorMessage(err));
        setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [options.redirectIfFound, options.redirectTo]);

  return useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      error,
      refresh,
    }),
    [error, isLoading, refresh, user],
  );
}
