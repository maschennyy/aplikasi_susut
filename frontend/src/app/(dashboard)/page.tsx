"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button, DatePicker, Typography } from "antd";
import { RefreshCw } from "lucide-react";
import { AnomalyPanel } from "@/components/dashboard/AnomalyPanel";
import { DeviasiTable } from "@/components/dashboard/DeviasiTable";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { SusutChart } from "@/components/dashboard/SusutChart";
import { WorkflowStrip } from "@/components/dashboard/WorkflowStrip";
import styles from "@/components/dashboard/dashboard.module.css";
import {
  currentDashboardPeriod,
  type ExecutiveDashboardData,
  type KpiData,
  type ResourceState,
  useDashboardData,
} from "@/hooks/useDashboardData";

const { Text, Title } = Typography;

function deriveKpiResource(resource: ResourceState<ExecutiveDashboardData>): ResourceState<KpiData> {
  return {
    data: resource.data?.kpi ?? null,
    error: resource.error,
    isLoading: resource.isLoading,
  };
}

export default function DashboardPage() {
  const [period, setPeriod] = useState(currentDashboardPeriod());
  const { dashboard, executive, workflow, query, refetch } = useDashboardData(period);

  const kpiResource = useMemo(() => deriveKpiResource(executive), [executive]);
  const periodValue = useMemo(() => dayjs(period, "YYYYMM"), [period]);
  const hasLoading = dashboard.isLoading || executive.isLoading || workflow.isLoading;

  return (
    <div className={styles.pageStack}>
      <section className={styles.pageToolbar}>
        <div>
          <Title level={2}>Dashboard Eksekutif</Title>
          <Text className={styles.toolbarMeta}>
            Ringkasan susut energi, deviasi GI, anomali, dan workflow periode {query.bulan}
          </Text>
        </div>

        <div className={styles.toolbarActions}>
          <DatePicker
            allowClear={false}
            format="MMMM YYYY"
            picker="month"
            value={periodValue}
            onChange={(value) => {
              if (value) setPeriod(value.format("YYYYMM"));
            }}
          />
          <Button
            icon={<RefreshCw aria-hidden="true" size={16} />}
            loading={hasLoading}
            onClick={() => void refetch()}
          >
            Refresh
          </Button>
        </div>
      </section>

      <KpiCards resource={kpiResource} />

      <div className={styles.dashboardGrid}>
        <SusutChart resource={dashboard} />
        <AnomalyPanel resource={executive} />
      </div>

      <WorkflowStrip resource={workflow} />

      <DeviasiTable resource={executive} />
    </div>
  );
}
