"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Badge, Button, Layout, Menu, Skeleton, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { filterNavGroups, findActiveNavItem, navIcon } from "@/components/layout/navigation";
import type { Role } from "@/types";
import styles from "./layout.module.css";

const { Sider } = Layout;
const { Text } = Typography;

type SidebarProps = {
  collapsed: boolean;
  giAktif: number;
  statsLoading: boolean;
  userRole?: Role | null;
  onCollapseChange: (collapsed: boolean) => void;
};

export function Sidebar({ collapsed, giAktif, statsLoading, userRole, onCollapseChange }: SidebarProps) {
  const pathname = usePathname();
  const activeItem = findActiveNavItem(pathname);

  const items = useMemo<MenuProps["items"]>(() => {
    return filterNavGroups(userRole).map((group) => ({
      key: group.key,
      type: "group" as const,
      label: group.label,
      children: group.items.map((item) => ({
        key: item.href,
        icon: navIcon(item.icon),
        label: (
          <Link className={styles.navLink} href={item.href}>
            {item.label}
          </Link>
        ),
        title: item.label,
      })),
    }));
  }, [userRole]);

  return (
    <Sider
      breakpoint="lg"
      className={styles.sidebar}
      collapsed={collapsed}
      collapsedWidth={76}
      collapsible
      theme="light"
      trigger={null}
      width={284}
      onBreakpoint={(broken) => onCollapseChange(broken)}
    >
      <div className={styles.sidebarInner}>
        <div className={styles.brandArea}>
          <Link className={styles.brandLink} href="/" aria-label="Dashboard Aplikasi Monitoring Susut Energi">
            <span className={styles.brandMark}>
              <Zap aria-hidden="true" size={22} strokeWidth={2.25} />
            </span>
            {!collapsed ? (
              <span className={styles.brandText}>
                <strong>PLN Susut</strong>
                <Text type="secondary">Monitoring Energi</Text>
              </span>
            ) : null}
          </Link>
          <Tooltip title={collapsed ? "Buka sidebar" : "Ciutkan sidebar"} placement="right">
            <Button
              aria-label={collapsed ? "Buka sidebar" : "Ciutkan sidebar"}
              className={styles.collapseButton}
              icon={collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              size="small"
              type="text"
              onClick={() => onCollapseChange(!collapsed)}
            />
          </Tooltip>
        </div>

        <Menu
          className={styles.navMenu}
          items={items}
          mode="inline"
          selectedKeys={activeItem ? [activeItem.href] : []}
        />

        <div className={styles.sidebarFooter}>
          <div className={styles.giStatus}>
            <span className={styles.giStatusIcon}>
              <Badge color="#00a650" status="processing" />
            </span>
            {!collapsed ? (
              <span className={styles.giStatusText}>
                <Text type="secondary">GI aktif</Text>
                {statsLoading ? <Skeleton.Input active size="small" className={styles.giSkeleton} /> : <strong>{giAktif}</strong>}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Sider>
  );
}
