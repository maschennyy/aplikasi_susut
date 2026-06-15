"use client";

import { Card, List, Skeleton, Tag, Typography } from "antd";
import { ShieldCheck, RefreshCw } from "lucide-react";
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
          icon={ShieldCheck}
          title="Tidak ada anomali"
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
