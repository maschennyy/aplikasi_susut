"use client";

import { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button, DatePicker, Typography } from "antd";
import { FilterX, RefreshCw } from "lucide-react";
import { AnomalyPanel } from "@/components/dashboard/AnomalyPanel";
import { DeviasiTable } from "@/components/dashboard/DeviasiTable";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { SusutChart } from "@/components/dashboard/SusutChart";
import { WorkflowStrip } from "@/components/dashboard/WorkflowStrip";
import styles from "@/components/dashboard/dashboard.module.css";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/shared/ActiveFilterChips";
import {
  currentDashboardPeriod,
  type ExecutiveDashboardData,
  type KpiData,
  type ResourceState,
  useDashboardData,
} from "@/hooks/useDashboardData";
import { formatPeriodLabel, previousPeriod } from "@/lib/period";

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

  const defaultPeriod = currentDashboardPeriod();
  const kpiResource = useMemo(() => deriveKpiResource(executive), [executive]);
  const periodValue = useMemo(() => dayjs(period, "YYYYMM"), [period]);
  const selectedPeriodLabel = useMemo(() => formatPeriodLabel(period), [period]);
  const hasLoading = dashboard.isLoading || executive.isLoading || workflow.isLoading;
  const hasActiveFilters = period !== defaultPeriod;

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleResetFilters = useCallback(() => {
    setPeriod(defaultPeriod);
  }, [defaultPeriod]);

  const handlePreviousPeriod = useCallback(() => {
    setPeriod((current) => previousPeriod(current));
  }, []);

  const activeFilters = useMemo<ActiveFilterChip[]>(() => {
    if (!hasActiveFilters) return [];

    return [
      {
        key: "periode",
        label: "Periode",
        value: selectedPeriodLabel,
        onClear: handleResetFilters,
      },
    ];
  }, [handleResetFilters, hasActiveFilters, selectedPeriodLabel]);

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
          {hasActiveFilters ? (
            <Button
              className={styles.resetFilterButton}
              icon={<FilterX aria-hidden="true" size={15} />}
              size="small"
              type="text"
              onClick={handleResetFilters}
            >
              Reset Filter
            </Button>
          ) : null}
          <Button
            icon={<RefreshCw aria-hidden="true" size={16} />}
            loading={hasLoading}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        </div>
      </section>

      <ActiveFilterChips filters={activeFilters} onResetAll={handleResetFilters} />

      <KpiCards resource={kpiResource} />

      <div className={styles.dashboardGrid}>
        <SusutChart
          resource={dashboard}
          selectedPeriodLabel={selectedPeriodLabel}
          onPreviousPeriod={handlePreviousPeriod}
          onRetry={handleRefresh}
        />
        <AnomalyPanel resource={executive} onRetry={handleRefresh} />
      </div>

      <WorkflowStrip resource={workflow} onRetry={handleRefresh} />

      <DeviasiTable
        resource={executive}
        selectedPeriodLabel={selectedPeriodLabel}
        onPreviousPeriod={handlePreviousPeriod}
        onRetry={handleRefresh}
      />
    </div>
  );
}
