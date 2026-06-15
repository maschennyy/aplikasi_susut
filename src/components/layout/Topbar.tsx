"use client";

import { useMemo, useState } from "react";
import { App, Avatar, Badge, Button, Dropdown, Layout, Space, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  Bell,
  ChevronDown,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { logout } from "@/lib/auth";
import type { User } from "@/types";
import styles from "./layout.module.css";

const { Header } = Layout;
const { Text } = Typography;

type TopbarProps = {
  alertCount: number;
  statsError: string | null;
  statsLoading: boolean;
  user: User | null;
  userLoading: boolean;
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
  statsError,
  statsLoading,
  user,
  userLoading,
}: TopbarProps) {
  const { message } = App.useApp();
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <Header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <Text className={styles.topbarAppName}>Aplikasi Monitoring Susut Energi</Text>
      </div>

      <Space className={styles.topbarRight} size={14}>
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
