"use client";

import { Alert, Card, Skeleton, Tooltip, Typography } from "antd";
import type { ResourceState, WorkflowMonth } from "@/hooks/useDashboardData";
import styles from "./dashboard.module.css";

const { Text, Title } = Typography;

type WorkflowStripProps = {
  resource: ResourceState<WorkflowMonth[]>;
};

const workflowLabel: Record<WorkflowMonth["status"], string> = {
  draft: "Draft",
  pending: "Pending",
  finalized: "Finalized",
  locked: "Locked",
};

export function WorkflowStrip({ resource }: WorkflowStripProps) {
  return (
    <Card className={styles.panelCard} variant="borderless">
      <div className={styles.panelHeader}>
        <div>
          <Title level={4}>Workflow Data Bulanan</Title>
          <Text type="secondary">Status validasi Jan-Des untuk tahun terpilih</Text>
        </div>
      </div>

      {resource.error ? (
        <Alert message="Workflow tidak dapat dimuat" description={resource.error} showIcon type="warning" />
      ) : resource.isLoading || !resource.data ? (
        <div className={styles.workflowGrid}>
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton.Button key={index} active block className={styles.workflowSkeleton} />
          ))}
        </div>
      ) : (
        <div className={styles.workflowGrid}>
          {resource.data.map((month) => (
            <Tooltip key={month.key} title={`${month.periode} - ${workflowLabel[month.status]}`}>
              <div className={`${styles.workflowMonth} ${styles[month.status]}`}>
                <strong>{month.monthLabel}</strong>
                <span>{workflowLabel[month.status]}</span>
              </div>
            </Tooltip>
          ))}
        </div>
      )}
    </Card>
  );
}
