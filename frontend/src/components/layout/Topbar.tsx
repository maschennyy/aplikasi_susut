"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { App, Avatar, Badge, Button, Dropdown, Layout, Space, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  User as UserIcon,
} from "lucide-react";
import { logout } from "@/lib/auth";
import { pageTitleFromPath } from "@/components/layout/navigation";
import type { User } from "@/types";
import styles from "./layout.module.css";

const { Header } = Layout;
const { Text, Title } = Typography;

type TopbarProps = {
  alertCount: number;
  collapsed: boolean;
  statsError: string | null;
  statsLoading: boolean;
  user: User | null;
  userLoading: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  onRefreshStats: () => Promise<void>;
};

function userInitials(user: User | null) {
  const source = user?.nama_lengkap || user?.username || "User";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleLabel(role?: User["role"]) {
  if (!role) return "Belum login";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function Topbar({
  alertCount,
  collapsed,
  statsError,
  statsLoading,
  user,
  userLoading,
  onCollapseChange,
  onRefreshStats,
}: TopbarProps) {
  const pathname = usePathname();
  const { message } = App.useApp();
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pageTitle = pageTitleFromPath(pathname);

  const userMenuItems = useMemo<MenuProps["items"]>(
    () => [
      {
        key: "profile",
        label: "Profile",
        icon: <UserIcon size={16} />,
      },
      {
        type: "divider",
      },
      {
        key: "logout",
        danger: true,
        label: "Keluar",
        icon: <LogOut size={16} />,
      },
    ],
    [],
  );

  const handleUserMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "profile") {
      window.location.assign("/profile");
      return;
    }

    if (key === "logout") {
      setLoggingOut(true);
      void logout().catch((err: unknown) => {
        setLoggingOut(false);
        void message.error(err instanceof Error ? err.message : "Gagal logout.");
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshStats();
      void message.success("Statistik diperbarui.");
    } catch {
      void message.error("Gagal memperbarui statistik.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <Tooltip title={collapsed ? "Buka sidebar" : "Ciutkan sidebar"}>
          <Button
            aria-label={collapsed ? "Buka sidebar" : "Ciutkan sidebar"}
            className={styles.topbarIconButton}
            icon={collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            type="text"
            onClick={() => onCollapseChange(!collapsed)}
          />
        </Tooltip>
        <div className={styles.mobileMenuIcon}>
          <MenuIcon aria-hidden="true" size={18} />
        </div>
        <div className={styles.pageTitleBlock}>
          <Text className={styles.pageEyebrow}>Aplikasi Monitoring Susut Energi</Text>
          <Title className={styles.pageTitle} level={3}>
            {pageTitle}
          </Title>
        </div>
      </div>

      <Space className={styles.topbarRight} size={14}>
        <Tooltip title={statsError || "Refresh statistik"}>
          <Button
            aria-label="Refresh statistik sidebar"
            className={styles.topbarIconButton}
            icon={<RefreshCw className={refreshing ? styles.spinIcon : undefined} size={17} />}
            loading={refreshing}
            type="text"
            onClick={handleRefresh}
          />
        </Tooltip>

        <Tooltip title={statsError || "Alert data penyulang bulan ini"}>
          <Badge count={alertCount} overflowCount={99} showZero={false} size="small">
            <Button
              aria-label={`${alertCount} alert aktif`}
              className={styles.alertButton}
              icon={<Bell size={18} />}
              loading={statsLoading}
              type="text"
            />
          </Badge>
        </Tooltip>

        <Dropdown
          menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
          placement="bottomRight"
          trigger={["click"]}
        >
          <Button className={styles.userButton} loading={userLoading || loggingOut} type="text">
            <Avatar className={styles.userAvatar} size={32}>
              {userInitials(user)}
            </Avatar>
            <span className={styles.userMeta}>
              <strong>{user?.nama_lengkap || user?.username || "User"}</strong>
              <Text type="secondary">{roleLabel(user?.role)}</Text>
            </span>
            <ChevronDown aria-hidden="true" size={16} />
          </Button>
        </Dropdown>
      </Space>
    </Header>
  );
}
