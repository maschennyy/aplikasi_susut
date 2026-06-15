"use client";

import { Alert, Card, Empty, List, Skeleton, Tag, Typography } from "antd";
import type { AnomalyItem, ExecutiveDashboardData, ResourceState } from "@/hooks/useDashboardData";
import styles from "./dashboard.module.css";

const { Text, Title } = Typography;

type AnomalyPanelProps = {
  resource: ResourceState<ExecutiveDashboardData>;
};

const severityMap: Record<AnomalyItem["severity"], { color: string; label: string }> = {
  normal: { color: "green", label: "Normal" },
  warning: { color: "gold", label: "Warning" },
  alert: { color: "red", label: "Alert" },
};

export function AnomalyPanel({ resource }: AnomalyPanelProps) {
  return (
    <Card className={styles.panelCard} variant="borderless">
      <div className={styles.panelHeader}>
        <div>
          <Title level={4}>Anomali Terbaru</Title>
          <Text type="secondary">Penyulang atau GI yang perlu perhatian operator</Text>
        </div>
      </div>

      {resource.error ? (
        <Alert message="Anomali tidak dapat dimuat" description={resource.error} showIcon type="warning" />
      ) : resource.isLoading || !resource.data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : resource.data.anomalies.length === 0 ? (
        <Empty description="Tidak ada anomali pada periode ini" />
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
