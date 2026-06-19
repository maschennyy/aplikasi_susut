"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Button, Menu, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { filterNavGroups, findActiveNavItem, navIcon } from "@/components/layout/navigation";
import type { Role } from "@/types";
import styles from "./layout.module.css";

const { Text } = Typography;

type SidebarProps = {
  collapsed: boolean;
  userRole?: Role | null;
  onCollapseChange: (collapsed: boolean) => void;
};

export function Sidebar({ collapsed, userRole, onCollapseChange }: SidebarProps) {
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
    <aside
      aria-label="Navigasi utama"
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : styles.sidebarExpanded}`}
    >
      <div className={styles.sidebarInner}>
        <div className={styles.brandArea}>
          <Link className={styles.brandLink} href="/dashboard" aria-label="Dashboard Aplikasi Monitoring Susut Energi">
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
      </div>
    </aside>
  );
}
