"use client";

import { Card, Skeleton, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CalendarClock, RefreshCw } from "lucide-react";
import type { DeviasiGiRow, ExecutiveDashboardData, ResourceState } from "@/hooks/useDashboardData";
import { EmptyState } from "@/components/shared/EmptyState";
import styles from "./dashboard.module.css";

const { Text, Title } = Typography;

type DeviasiTableProps = {
  resource: ResourceState<ExecutiveDashboardData>;
  selectedPeriodLabel: string;
  onPreviousPeriod: () => void;
  onRetry: () => void;
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

export function DeviasiTable({ resource, selectedPeriodLabel, onPreviousPeriod, onRetry }: DeviasiTableProps) {
  return (
    <Card className={styles.panelCard} variant="borderless">
      <div className={styles.panelHeader}>
        <div>
          <Title level={4}>Deviasi Gardu Induk</Title>
          <Text type="secondary">Perbandingan kWh masuk, keluar, dan susut per GI</Text>
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
      ) : resource.data.deviasiGi.length === 0 ? (
        <EmptyState
          actionLabel="Lihat Bulan Sebelumnya"
          description={`Data untuk periode ${selectedPeriodLabel} belum tersedia. Pastikan data sudah diinput atau coba bulan sebelumnya.`}
          icon={CalendarClock}
          title="Belum ada data bulan ini"
          onAction={onPreviousPeriod}
        />
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
