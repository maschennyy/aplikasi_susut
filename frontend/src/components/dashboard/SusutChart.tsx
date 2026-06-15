"use client";

import { Alert, Card, Empty, Skeleton, Typography } from "antd";
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
import styles from "./dashboard.module.css";

const { Text, Title } = Typography;

type SusutChartProps = {
  resource: ResourceState<DashboardData>;
};

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export function SusutChart({ resource }: SusutChartProps) {
  return (
    <Card className={styles.panelCard} variant="borderless">
      <div className={styles.panelHeader}>
        <div>
          <Title level={4}>Tren Susut Bulanan</Title>
          <Text type="secondary">Persentase susut jaringan berdasarkan data bulanan</Text>
        </div>
      </div>

      {resource.error ? (
        <Alert message="Grafik susut tidak dapat dimuat" description={resource.error} showIcon type="warning" />
      ) : resource.isLoading || !resource.data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : resource.data.monthlyData.length === 0 ? (
        <Empty description="Belum ada data susut untuk periode ini" />
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
