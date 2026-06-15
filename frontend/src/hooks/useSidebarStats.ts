"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import type { SidebarStats } from "@/types";

const REFRESH_INTERVAL_MS = 60_000;
const EMPTY_STATS: SidebarStats = {
  gi_aktif: 0,
  alert_count: 0,
};

type UseSidebarStatsState = {
  stats: SidebarStats;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useSidebarStats(): UseSidebarStatsState {
  const [stats, setStats] = useState<SidebarStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const response = await api.get<SidebarStats>("/sidebar-stats");
      if (!mountedRef.current) return;
      setStats({
        gi_aktif: Number(response.data.gi_aktif || 0),
        alert_count: Number(response.data.alert_count || 0),
      });
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(apiErrorMessage(err, "Gagal memuat statistik sidebar."));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  return {
    stats,
    isLoading,
    error,
    refresh,
  };
}
