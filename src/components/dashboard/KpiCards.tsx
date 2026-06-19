"use client";

import { Alert, Card, Col, Row, Skeleton, Typography } from "antd";
import { Activity, Factory, Gauge, Triangle, Zap } from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import type { KpiData, ResourceState } from "@/hooks/useDashboardData";
import { formatCompactNumber, formatPercent, formatRoundedNumber } from "@/lib/formatters";
import styles from "./dashboard.module.css";

const { Text } = Typography;

type KpiCardsProps = {
  resource: ResourceState<KpiData>;
};

type KpiAccent = "neutral" | "success" | "warning" | "danger";
type TrendDirection = "up-good" | "down-good";

const kpiConfig = [
  {
    key: "totalGi",
    label: "Total GI",
    icon: Factory,
    value: (data: KpiData) => formatRoundedNumber(data.totalGi),
    accent: (): KpiAccent => "neutral",
    trend: (data: KpiData) => data.totalGiTrendPersen,
    trendDirection: "up-good",
    meta: "Gardu induk terpantau",
  },
  {
    key: "giAktif",
    label: "GI Aktif",
    icon: Zap,
    value: (data: KpiData) => formatRoundedNumber(data.giAktif),
    accent: (data: KpiData): KpiAccent => {
      const inactiveCount = Math.max(data.totalGi - data.giAktif, 0);
      if (inactiveCount >= 2) return "danger";
      if (inactiveCount === 1) return "warning";
      return "success";
    },
    trend: (data: KpiData) => data.giAktifTrendPersen,
    trendDirection: "up-good",
    meta: "Status operasional",
  },
  {
    key: "rataSusutPersen",
    label: "Rata-rata Susut",
    icon: Gauge,
    accent: (data: KpiData): KpiAccent => {
      if (data.rataSusutPersen > 10) return "danger";
      if (data.rataSusutPersen >= 8) return "warning";
      return "success";
    },
    trend: (data: KpiData) => data.rataSusutTrendPersen,
    trendDirection: "down-good",
    meta: "Periode terpilih",
  },
  {
    key: "totalKwhMasuk",
    label: "Total kWh Masuk",
    icon: Activity,
    value: (data: KpiData) => formatCompactNumber(data.totalKwhMasuk),
    accent: (): KpiAccent => "neutral",
    trend: (data: KpiData) => data.totalKwhMasukTrendPersen,
    trendDirection: "up-good",
    meta: "Energi masuk jaringan",
  },
] as const;

const cardAccentClass: Record<KpiAccent, string> = {
  neutral: styles.kpiCardNeutral,
  success: styles.kpiCardSuccess,
  warning: styles.kpiCardWarning,
  danger: styles.kpiCardDanger,
};

function trendTone(value: number, direction: TrendDirection) {
  if (value === 0) return styles.trendNeutral;
  const isGood = direction === "down-good" ? value < 0 : value > 0;
  return isGood ? styles.trendPositive : styles.trendNegative;
}

function lossGaugeColor(value: number) {
  if (value > 10) return "#d33f49";
  if (value >= 8) return "#d78312";
  return "#12805c";
}

function LossGauge({ value }: { value: number }) {
  const clampedValue = Math.min(Math.max(value, 0), 15);
  const gaugeColor = lossGaugeColor(value);
  const gaugeData = [{ name: "Susut", value: clampedValue, fill: gaugeColor }];

  return (
    <div className={styles.lossGauge} aria-label={`Rata-rata susut ${formatPercent(value)}`}>
      <RadialBarChart
        width={124}
        height={84}
        cx={62}
        cy={68}
        innerRadius={36}
        outerRadius={48}
        startAngle={180}
        endAngle={0}
        data={gaugeData}
      >
        <PolarAngleAxis type="number" domain={[0, 15]} tick={false} />
        <RadialBar dataKey="value" background={{ fill: "#e5e7eb" }} cornerRadius={8} />
      </RadialBarChart>
      <div className={styles.lossGaugeValue}>
        <strong>{formatPercent(value)}</strong>
        <span>skala 0-15%</span>
      </div>
      <div className={styles.lossGaugeTicks} aria-hidden="true">
        <span>0</span>
        <span>15%</span>
      </div>
    </div>
  );
}

export function KpiCards({ resource }: KpiCardsProps) {
  if (resource.error) {
    return <Alert message="KPI tidak dapat dimuat" description={resource.error} showIcon type="warning" />;
  }

  return (
    <Row gutter={[16, 16]}>
      {kpiConfig.map((item) => {
        const Icon = item.icon;
        const data = resource.data;
        const accent = data ? item.accent(data) : "neutral";
        const trendValue = data ? item.trend(data) : 0;
        const trendIconClass = trendValue < 0 ? styles.trendIconDown : styles.trendIconUp;

        return (
          <Col key={item.key} lg={6} md={12} xs={24}>
            <Card className={`${styles.kpiCard} ${cardAccentClass[accent]}`} variant="borderless">
              {resource.isLoading || !data ? (
                <Skeleton active paragraph={{ rows: 2 }} title={{ width: "45%" }} />
              ) : (
                <>
                  <div className={styles.kpiHeader}>
                    <Text className={styles.kpiLabel}>{item.label}</Text>
                    <span className={styles.kpiIcon}>
                      <Icon aria-hidden="true" size={19} strokeWidth={1.5} />
                    </span>
                  </div>
                  {item.key === "rataSusutPersen" ? (
                    <LossGauge value={data.rataSusutPersen} />
                  ) : (
                    <div className={styles.kpiValue}>{item.value(data)}</div>
                  )}
                  <div className={`${styles.kpiTrend} ${trendTone(trendValue, item.trendDirection)}`}>
                    <Triangle aria-hidden="true" className={trendIconClass} size={12} fill="currentColor" strokeWidth={1.5} />
                    <span>{formatPercent(Math.abs(trendValue))}</span>
                    <Text type="secondary">vs periode sebelumnya</Text>
                  </div>
                  <Text className={styles.kpiMeta}>{item.meta}</Text>
                </>
              )}
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
