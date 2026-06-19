"use client";

import { Card, List, Skeleton, Tag, Typography } from "antd";
import { RefreshCw } from "lucide-react";
import type { AnomalyItem, ExecutiveDashboardData, ResourceState } from "@/hooks/useDashboardData";
import { EmptyState } from "@/components/shared/EmptyState";
import styles from "./dashboard.module.css";

const { Text, Title } = Typography;

type AnomalyPanelProps = {
  resource: ResourceState<ExecutiveDashboardData>;
  onRetry: () => void;
};

const severityMap: Record<AnomalyItem["severity"], { color: string; label: string }> = {
  normal: { color: "green", label: "Normal" },
  warning: { color: "gold", label: "Warning" },
  alert: { color: "red", label: "Alert" },
};

function AnomalyClearIllustration() {
  return (
    <svg aria-hidden="true" className={styles.emptyIllustration} viewBox="0 0 120 84" fill="none">
      <rect x="18" y="12" width="84" height="60" rx="18" fill="#DFF8EA" />
      <circle cx="58" cy="42" r="20" fill="#FFFFFF" stroke="#12805C" strokeWidth="2" />
      <path d="M48 42.5L55 49L70 33" stroke="#12805C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M83 25L77 39H85L79 55" stroke="#0F9F8F" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34 31H43" stroke="#8CD9B1" strokeWidth="2" strokeLinecap="round" />
      <path d="M31 42H40" stroke="#8CD9B1" strokeWidth="2" strokeLinecap="round" />
      <path d="M36 53H45" stroke="#8CD9B1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AnomalyPanel({ resource, onRetry }: AnomalyPanelProps) {
  return (
    <Card className={styles.panelCard} variant="borderless">
      <div className={styles.panelHeader}>
        <div>
          <Title level={4}>Anomali Terbaru</Title>
          <Text type="secondary">Penyulang atau GI yang perlu perhatian operator</Text>
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
      ) : resource.data.anomalies.length === 0 ? (
        <EmptyState
          description="Tidak ada anomali baru pada periode terpilih."
          illustration={<AnomalyClearIllustration />}
          title="Tidak ada anomali"
          variant="success"
        />
      ) : (
        <List
          className={styles.anomalyList}
          dataSource={resource.data.anomalies}
          renderItem={(item) => (
            <List.Item className={styles.anomalyItem}>
              <List.Item.Meta
                description={<Text type="secondary">{item.subtitle}</Text>}
                title={<span>{item.title}</span>}
              />
              <div className={styles.anomalyMetric}>
                <strong>{item.metric}</strong>
                <Tag color={severityMap[item.severity].color}>{severityMap[item.severity].label}</Tag>
              </div>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
