"use client";

import { Card, Skeleton, Statistic, Typography } from "antd";
import type { DeviationValue, DeviasiSummary as DeviasiSummaryData } from "@/lib/deviasi";
import styles from "./deviasi.module.css";

const { Text, Title } = Typography;
const NUMBER = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DeviasiSummaryProps = {
  summary: DeviasiSummaryData;
  loading: boolean;
};

function formatPercent(value: number | null) {
  return value === null ? "-" : `${PERCENT.format(value)}%`;
}

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
        <Statistic title="Total Meter Utama" value={NUMBER.format(summary.totalMeterUtama)} suffix="kWh" />
        <Statistic title="Total Meter Pembanding" value={NUMBER.format(summary.totalMeterPembanding)} suffix="kWh" />
        <Statistic title="Total Penyulang" value={NUMBER.format(summary.totalPenyulang)} suffix="kWh" />
        <div className={severityClass(summary.deviasiUtamaPembanding)}>
          <Statistic title="Deviasi Utama - Pembanding" value={NUMBER.format(summary.deviasiUtamaPembanding.kwh)} suffix="kWh" />
          <Text>{formatPercent(summary.deviasiUtamaPembanding.percent)}</Text>
        </div>
        <div className={severityClass(summary.deviasiPembandingFeeder)}>
          <Statistic title="Deviasi Pembanding - Penyulang" value={NUMBER.format(summary.deviasiPembandingFeeder.kwh)} suffix="kWh" />
          <Text>{formatPercent(summary.deviasiPembandingFeeder.percent)}</Text>
        </div>
      </div>
    </Card>
  );
}
