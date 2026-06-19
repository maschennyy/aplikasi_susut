"use client";

import { Card, Skeleton, Typography } from "antd";
import { RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData, ResourceState } from "@/hooks/useDashboardData";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatPercent } from "@/lib/formatters";
import styles from "./dashboard.module.css";

const { Text, Title } = Typography;

type SusutChartProps = {
  resource: ResourceState<DashboardData>;
  selectedPeriodLabel: string;
  onPreviousPeriod: () => void;
  onRetry: () => void;
};

function TrendEmptyIllustration() {
  return (
    <svg aria-hidden="true" className={styles.emptyIllustration} viewBox="0 0 120 84" fill="none">
      <rect x="14" y="12" width="92" height="60" rx="14" fill="#E8F7F5" />
      <path d="M31 58H91" stroke="#B8DAD6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M31 46H91" stroke="#D3E8E5" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M31 34H91" stroke="#D3E8E5" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M33 55C41 43 48 47 55 36C62 25 70 31 77 24C83 18 88 21 94 16" stroke="#0F9F8F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="55" cy="36" r="4" fill="#FFFFFF" stroke="#0F9F8F" strokeWidth="2" />
      <path d="M44 66H76" stroke="#073B86" strokeWidth="2" strokeLinecap="round" />
      <path d="M60 72V66" stroke="#073B86" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SusutChart({ resource, selectedPeriodLabel, onPreviousPeriod, onRetry }: SusutChartProps) {
  return (
    <Card className={styles.panelCard} variant="borderless">
      <div className={styles.panelHeader}>
        <div>
          <Title level={4}>Tren Susut Bulanan</Title>
          <Text type="secondary">Persentase susut jaringan berdasarkan data bulanan</Text>
        </div>
      </div>

      {resource.error ? (
        <EmptyState
          actionLabel="Coba Lagi"
          description="Terjadi kesalahan saat mengambil data. Periksa koneksi atau coba muat ulang."
          icon={RefreshCw}
          title="Gagal memuat data"
          onAction={onRetry}
        />
      ) : resource.isLoading || !resource.data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : resource.data.monthlyData.length === 0 ? (
        <EmptyState
          actionLabel="Lihat Bulan Sebelumnya"
          actionType="primary"
          description={`Data untuk periode ${selectedPeriodLabel} belum tersedia. Pastikan data sudah diinput atau coba bulan sebelumnya.`}
          illustration={<TrendEmptyIllustration />}
          title="Belum ada data bulan ini"
          variant="neutral"
          onAction={onPreviousPeriod}
        />
      ) : (
        <div className={styles.chartFrame}>
          <ResponsiveContainer height={300} width="100%">
            <AreaChart data={resource.data.monthlyData} margin={{ bottom: 0, left: 0, right: 18, top: 16 }}>
              <defs>
                <linearGradient id="susutFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#00a3d7" stopOpacity={0.34} />
                  <stop offset="95%" stopColor="#0f9f8f" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e7edf5" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="monthLabel" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickFormatter={(value: number) => `${value.toFixed(1)}%`}
                tickLine={false}
                width={58}
              />
              <RechartsTooltip
                formatter={(value) => [formatPercent(Number(value)), "Susut"]}
                labelFormatter={(label) => `Bulan ${label}`}
              />
              <Area
                activeDot={{ r: 5 }}
                dataKey="susutPersen"
                fill="url(#susutFill)"
                name="Susut"
                stroke="#00a3d7"
                strokeWidth={2.5}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
