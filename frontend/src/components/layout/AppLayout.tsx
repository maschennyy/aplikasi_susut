"use client";

import type { ReactNode } from "react";
import { useState } from "react";
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

  return (
    <Layout hasSider className={styles.appShell}>
      <Sidebar
        collapsed={collapsed}
        giAktif={sidebarStats.stats.gi_aktif}
        statsLoading={sidebarStats.isLoading}
        userRole={user.role}
        onCollapseChange={setCollapsed}
      />
      <Layout className={styles.mainShell}>
        <Topbar
          alertCount={sidebarStats.stats.alert_count}
          collapsed={collapsed}
          statsError={sidebarStats.error}
          statsLoading={sidebarStats.isLoading}
          user={user}
          userLoading={false}
          onCollapseChange={setCollapsed}
          onRefreshStats={sidebarStats.refresh}
        />
        <main className={styles.contentShell}>{children}</main>
      </Layout>
    </Layout>
  );
}
