"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Layout, Spin } from "antd";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarStats } from "@/hooks/useSidebarStats";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import type { User } from "@/types";
import styles from "./layout.module.css";

type AppLayoutProps = {
  children: ReactNode;
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "pln-susut-sidebar-collapsed";

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const isAuthRoute = pathname === "/login";

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}

function AuthenticatedShell({ children }: AppLayoutProps) {
  const auth = useAuth({ redirectTo: "/login" });

  if (auth.isLoading) {
    return (
      <div className={styles.authLoadingShell}>
        <Spin size="large" />
      </div>
    );
  }

  if (!auth.isLoggedIn || !auth.user) {
    return null;
  }

  return <AuthenticatedFrame user={auth.user}>{children}</AuthenticatedFrame>;
}

function AuthenticatedFrame({ children, user }: AppLayoutProps & { user: User }) {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarStats = useSidebarStats();

  useEffect(() => {
    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (storedValue === "true" || storedValue === "false") {
      setCollapsed(storedValue === "true");
    }
  }, []);

  const handleCollapseChange = useCallback((nextCollapsed: boolean) => {
    setCollapsed(nextCollapsed);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(nextCollapsed));
  }, []);

  return (
    <Layout hasSider className={styles.appShell}>
      <Sidebar
        collapsed={collapsed}
        giAktif={sidebarStats.stats.gi_aktif}
        statsLoading={sidebarStats.isLoading}
        userRole={user.role}
        onCollapseChange={handleCollapseChange}
      />
      <Layout className={styles.mainShell}>
        <Topbar
          alertCount={sidebarStats.stats.alert_count}
          statsError={sidebarStats.error}
          statsLoading={sidebarStats.isLoading}
          user={user}
          userLoading={false}
        />
        <main className={styles.contentShell}>{children}</main>
      </Layout>
    </Layout>
  );
}
