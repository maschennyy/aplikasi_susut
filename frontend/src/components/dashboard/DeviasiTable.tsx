"use client";

import { Alert, Card, Empty, Skeleton, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DeviasiGiRow, ExecutiveDashboardData, ResourceState } from "@/hooks/useDashboardData";
import styles from "./dashboard.module.css";

const { Text, Title } = Typography;

type DeviasiTableProps = {
  resource: ResourceState<ExecutiveDashboardData>;
};

const statusMap: Record<DeviasiGiRow["status"], { color: string; label: string }> = {
  normal: { color: "success", label: "Normal" },
  warning: { color: "warning", label: "Warning" },
  alert: { color: "error", label: "Alert" },
};

function formatKwh(value: number) {
  return new Intl.NumberFormat("id-ID").format(Math.round(value));
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

const columns: ColumnsType<DeviasiGiRow> = [
  {
    title: "GI",
    dataIndex: "giName",
    key: "giName",
    fixed: "left",
    render: (value: string) => <strong>{value}</strong>,
  },
  {
    title: "kWh Masuk",
    dataIndex: "kwhMasuk",
    key: "kwhMasuk",
    align: "right",
    render: (value: number) => <span className={styles.monoCell}>{formatKwh(value)}</span>,
  },
  {
    title: "kWh Keluar",
    dataIndex: "kwhKeluar",
    key: "kwhKeluar",
    align: "right",
    render: (value: number) => <span className={styles.monoCell}>{formatKwh(value)}</span>,
  },
  {
    title: "Susut kWh",
    dataIndex: "susutKwh",
    key: "susutKwh",
    align: "right",
    render: (value: number) => <span className={styles.monoCell}>{formatKwh(value)}</span>,
  },
  {
    title: "Susut %",
    dataIndex: "susutPersen",
    key: "susutPersen",
    align: "right",
    render: (value: number) => <span className={styles.monoCell}>{formatPercent(value)}</span>,
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
    render: (value: DeviasiGiRow["status"]) => <Tag color={statusMap[value].color}>{statusMap[value].label}</Tag>,
  },
];

export function DeviasiTable({ resource }: DeviasiTableProps) {
  return (
    <Card className={styles.panelCard} variant="borderless">
      <div className={styles.panelHeader}>
        <div>
          <Title level={4}>Deviasi Gardu Induk</Title>
          <Text type="secondary">Perbandingan kWh masuk, keluar, dan susut per GI</Text>
        </div>
      </div>

      {resource.error ? (
        <Alert message="Tabel deviasi tidak dapat dimuat" description={resource.error} showIcon type="warning" />
      ) : resource.isLoading || !resource.data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : resource.data.deviasiGi.length === 0 ? (
        <Empty description="Belum ada deviasi GI untuk periode ini" />
      ) : (
        <Table<DeviasiGiRow>
          columns={columns}
          dataSource={resource.data.deviasiGi}
          pagination={{ pageSize: 6, showSizeChanger: false }}
          rowKey="key"
          scroll={{ x: 760 }}
          size="middle"
        />
      )}
    </Card>
  );
}
