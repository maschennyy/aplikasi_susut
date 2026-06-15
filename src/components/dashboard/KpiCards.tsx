"use client";

import { Alert, Card, Col, Row, Skeleton, Typography } from "antd";
import { Activity, Factory, Gauge, Zap } from "lucide-react";
import type { KpiData, ResourceState } from "@/hooks/useDashboardData";
import styles from "./dashboard.module.css";

const { Text } = Typography;

type KpiCardsProps = {
  resource: ResourceState<KpiData>;
};

const kpiConfig = [
  {
    key: "totalGi",
    label: "Total GI",
    tone: "blue",
    icon: Factory,
    value: (data: KpiData) => formatNumber(data.totalGi),
    meta: "Gardu induk terpantau",
  },
  {
    key: "giAktif",
    label: "GI Aktif",
    tone: "green",
    icon: Zap,
    value: (data: KpiData) => formatNumber(data.giAktif),
    meta: "Status operasional",
  },
  {
    key: "rataSusutPersen",
    label: "Rata-rata Susut",
    tone: "amber",
    icon: Gauge,
    value: (data: KpiData) => `${data.rataSusutPersen.toFixed(2)}%`,
    meta: "Periode terpilih",
  },
  {
    key: "totalKwhMasuk",
    label: "Total kWh Masuk",
    tone: "indigo",
    icon: Activity,
    value: (data: KpiData) => formatCompact(data.totalKwhMasuk),
    meta: "Energi masuk jaringan",
  },
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(Math.round(value));
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

export function KpiCards({ resource }: KpiCardsProps) {
  if (resource.error) {
    return <Alert message="KPI tidak dapat dimuat" description={resource.error} showIcon type="warning" />;
  }

  return (
    <Row gutter={[16, 16]}>
      {kpiConfig.map((item) => {
        const Icon = item.icon;
        return (
          <Col key={item.key} lg={6} md={12} xs={24}>
            <Card className={styles.kpiCard} variant="borderless">
              {resource.isLoading || !resource.data ? (
                <Skeleton active paragraph={{ rows: 2 }} title={{ width: "45%" }} />
              ) : (
                <>
                  <div className={styles.kpiHeader}>
                    <Text className={styles.kpiLabel}>{item.label}</Text>
                    <span className={`${styles.kpiIcon} ${styles[item.tone]}`}>
                      <Icon aria-hidden="true" size={18} />
                    </span>
                  </div>
                  <div className={styles.kpiValue}>{item.value(resource.data)}</div>
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
