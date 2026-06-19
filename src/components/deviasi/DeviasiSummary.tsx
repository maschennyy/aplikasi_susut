"use client";

import { Card, Skeleton, Statistic, Typography } from "antd";
import type { DeviationValue, DeviasiSummary as DeviasiSummaryData } from "@/lib/deviasi";
import { formatNumber, formatPercent } from "@/lib/formatters";
import styles from "./deviasi.module.css";

const { Text, Title } = Typography;

type DeviasiSummaryProps = {
  summary: DeviasiSummaryData;
  loading: boolean;
};

function severityClass(value: DeviationValue) {
  if (value.severity === "alert") return styles.summaryAlert;
  if (value.severity === "warning") return styles.summaryWarning;
  return styles.summaryNormal;
}

export function DeviasiSummary({ summary, loading }: DeviasiSummaryProps) {
  if (loading && summary.totalRows === 0) {
    return <Card className={styles.panelCard} variant="borderless"><Skeleton active paragraph={{ rows: 2 }} /></Card>;
  }

  return (
    <Card className={styles.panelCard} variant="borderless">
      <div className={styles.summaryHeader}>
        <div>
          <Title level={4}>Ringkasan Total</Title>
          <Text type="secondary">Persentase dihitung ulang dari total kWh, bukan rata-rata persentase tiap trafo.</Text>
        </div>
        <div className={styles.statusCounts}>
          <span>Normal <strong>{summary.normalCount}</strong></span>
          <span>Warning <strong>{summary.warningCount}</strong></span>
          <span>Alert <strong>{summary.alertCount}</strong></span>
          <span>Data belum lengkap <strong>{summary.incompleteCount}</strong></span>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <Statistic title="Total Meter Utama" value={formatNumber(summary.totalMeterUtama)} suffix="kWh" />
        <Statistic title="Total Meter Pembanding" value={formatNumber(summary.totalMeterPembanding)} suffix="kWh" />
        <Statistic title="Total Penyulang" value={formatNumber(summary.totalPenyulang)} suffix="kWh" />
        <div className={severityClass(summary.deviasiUtamaPembanding)}>
          <Statistic title="Deviasi Utama - Pembanding" value={formatNumber(summary.deviasiUtamaPembanding.kwh)} suffix="kWh" />
          <Text>{formatPercent(summary.deviasiUtamaPembanding.percent)}</Text>
        </div>
        <div className={severityClass(summary.deviasiPembandingFeeder)}>
          <Statistic title="Deviasi Pembanding - Penyulang" value={formatNumber(summary.deviasiPembandingFeeder.kwh)} suffix="kWh" />
          <Text>{formatPercent(summary.deviasiPembandingFeeder.percent)}</Text>
        </div>
      </div>
    </Card>
  );
}
