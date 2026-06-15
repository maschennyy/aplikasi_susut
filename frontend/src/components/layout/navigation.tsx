import type { ReactNode } from "react";
import {
  Activity,
  ArrowLeftRight,
  BarChart2,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  GitCompare,
  LayoutDashboard,
  Scale,
  Shield,
  ShoppingCart,
  TrendingDown,
  Upload,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: readonly Role[];
};

export type NavGroup = {
  key: string;
  label: string;
  items: readonly NavItem[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: "monitoring",
    label: "Monitoring",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard },
      { key: "penyulang", label: "kWh Penyulang", href: "/penyulang", icon: Zap },
      { key: "kwh-utama", label: "kWh Utama", href: "/kwh-utama", icon: Gauge },
      { key: "kwh-pembanding", label: "kWh Pembanding", href: "/kwh-pembanding", icon: GitCompare },
      { key: "deviasi", label: "Deviasi", href: "/deviasi", icon: TrendingDown },
      { key: "proporsional", label: "Proporsional", href: "/proporsional", icon: Scale },
      { key: "transfer-antar-uid", label: "Transfer Antar UID", href: "/transfer-antar-uid", icon: ArrowLeftRight },
      { key: "transfer", label: "Transfer EXIM", href: "/transfer", icon: FileText },
      { key: "rekap", label: "Rekap", href: "/rekap", icon: ClipboardList },
      { key: "psgi", label: "PSGI", href: "/psgi", icon: BarChart2 },
      { key: "emin", label: "EMIN", href: "/emin", icon: Activity },
      { key: "kwh-jual", label: "kWh Jual", href: "/kwh-jual", icon: ShoppingCart },
    ],
  },
  {
    key: "administrasi",
    label: "Administrasi",
    items: [
      { key: "master-data", label: "Master Data", href: "/master-data", icon: Database, roles: ["admin", "operator"] },
      { key: "upload", label: "Upload Data", href: "/upload", icon: Upload, roles: ["admin", "operator"] },
      { key: "security", label: "Security", href: "/security", icon: Shield, roles: ["admin"] },
    ],
  },
  {
    key: "akun",
    label: "Akun",
    items: [{ key: "profile", label: "Profile", href: "/profile", icon: User }],
  },
];

export function canAccessItem(item: NavItem, role?: Role | null) {
  return !item.roles || Boolean(role && item.roles.includes(role));
}

export function filterNavGroups(role?: Role | null) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessItem(item, role)),
  })).filter((group) => group.items.length > 0);
}

export function findActiveNavItem(pathname: string) {
  const allItems = NAV_GROUPS.flatMap((group) => group.items);
  const exactMatch = allItems.find((item) => item.href === pathname);
  if (exactMatch) return exactMatch;

  return allItems
    .filter((item) => item.href !== "/" && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function pageTitleFromPath(pathname: string) {
  return findActiveNavItem(pathname)?.label || "Aplikasi Monitoring Susut Energi";
}

export function navIcon(Icon: LucideIcon): ReactNode {
  return <Icon aria-hidden="true" size={18} strokeWidth={2} />;
}
