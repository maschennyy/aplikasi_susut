"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "@/lib/auth";
import type { User } from "@/types";

type UseAuthOptions = {
  redirectTo?: string;
  redirectIfFound?: string;
};

type UseAuthResult = {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  refresh: () => Promise<User | null>;
};

function redirectTo(path: string) {
  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
}

export function useAuth(options: UseAuthOptions = {}): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
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
          redirectTo(options.redirectTo);
        }

        if (currentUser && options.redirectIfFound) {
          redirectTo(options.redirectIfFound);
        }
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
      isLoggedIn: Boolean(user),
      refresh,
    }),
    [isLoading, refresh, user],
  );
}
