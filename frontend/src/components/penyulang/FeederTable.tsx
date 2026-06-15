"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Descriptions, Empty, Skeleton, Space, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { RefreshCw } from "lucide-react";
import { AnomalyBadge } from "@/components/penyulang/AnomalyBadge";
import type { FeederMetadata, FeederRow } from "@/hooks/useFeederData";
import styles from "./penyulang.module.css";

const { Text } = Typography;

type FeederTableProps = {
  rows: FeederRow[];
  metadata: FeederMetadata;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

const PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatKwh(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatPercent(value: number) {
  return `${PERCENT_FORMATTER.format(value)}%`;
}

function compactValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return NUMBER_FORMATTER.format(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return String(value);
}

function rowSeverityClass(row: FeederRow) {
  if (row.anomalyFlags.length > 0) return styles.alertRow;
  if (Math.abs(row.susutPersen) >= 10) return styles.warningRow;
  return "";
}

export function FeederTable({ rows, metadata, loading, error, onRefresh }: FeederTableProps) {
  const [expandedRowKeys, setExpandedRowKeys] = useState<readonly React.Key[]>([]);

  const columns = useMemo<TableColumnsType<FeederRow>>(
    () => [
      {
        title: "Penyulang",
        dataIndex: "penyulangNama",
        key: "penyulangNama",
        fixed: "left",
        sorter: (a, b) => a.penyulangNama.localeCompare(b.penyulangNama),
        width: 230,
        render: (_, row) => (
          <div className={styles.primaryCell}>
            <strong>{row.penyulangNama}</strong>
            <Text type="secondary">{row.penyulangKode || "Kode belum tersedia"}</Text>
          </div>
        ),
      },
      {
        title: "Trafo",
        dataIndex: "trafoNama",
        key: "trafoNama",
        sorter: (a, b) => a.trafoNama.localeCompare(b.trafoNama),
        width: 170,
      },
      {
        title: "GI",
        dataIndex: "giNama",
        key: "giNama",
        sorter: (a, b) => a.giNama.localeCompare(b.giNama),
        width: 190,
      },
      {
        title: "kWh Kirim",
        dataIndex: "kwhKirim",
        key: "kwhKirim",
        align: "right",
        sorter: (a, b) => a.kwhKirim - b.kwhKirim,
        width: 150,
        render: (value: number) => <span className={styles.monoCell}>{formatKwh(value)}</span>,
      },
      {
        title: "kWh Terima",
        dataIndex: "kwhTerima",
        key: "kwhTerima",
        align: "right",
        sorter: (a, b) => a.kwhTerima - b.kwhTerima,
        width: 150,
        render: (value: number) => <span className={styles.monoCell}>{formatKwh(value)}</span>,
      },
      {
        title: "Susut kWh",
        dataIndex: "susutKwh",
        key: "susutKwh",
        align: "right",
        sorter: (a, b) => a.susutKwh - b.susutKwh,
        width: 145,
        render: (value: number) => <span className={styles.monoCell}>{formatKwh(value)}</span>,
      },
      {
        title: "Susut %",
        dataIndex: "susutPersen",
        key: "susutPersen",
        align: "right",
        sorter: (a, b) => a.susutPersen - b.susutPersen,
        width: 120,
        render: (value: number) => (
          <span className={value >= 10 ? styles.percentAlert : styles.monoCell}>{formatPercent(value)}</span>
        ),
      },
      {
        title: "Anomali",
        dataIndex: "anomalyFlags",
        key: "anomalyFlags",
        width: 260,
        render: (_, row) => {
          if (row.anomalyFlags.length === 0) {
            return <Text type="secondary">Normal</Text>;
          }
          return (
            <Space wrap size={[0, 6]}>
              {row.anomalyFlags.map((flag) => (
                <AnomalyBadge key={flag} flag={flag} />
              ))}
            </Space>
          );
        },
      },
    ],
    [],
  );

  if (loading && rows.length === 0) {
    return (
      <div className={styles.tableSkeleton}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        action={
          <Button icon={<RefreshCw aria-hidden="true" size={15} />} size="small" onClick={() => void onRefresh()}>
            Coba Lagi
          </Button>
        }
        message="Data kWh penyulang tidak bisa dimuat"
        showIcon
        type="error"
        description={error}
      />
    );
  }

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableSummary}>
        <span>{metadata.totalRows} baris</span>
        <span>Kirim {formatKwh(metadata.totalKwhKirim)} kWh</span>
        <span>Terima {formatKwh(metadata.totalKwhTerima)} kWh</span>
        <span>Rata-rata susut {formatPercent(metadata.avgSusutPersen)}</span>
      </div>

      <Table<FeederRow>
        columns={columns}
        dataSource={rows}
        expandable={{
          expandedRowKeys,
          expandedRowRender: (row) => (
            <Descriptions bordered column={4} size="small">
              {Object.entries(row.detail).slice(0, 20).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {compactValue(value)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          ),
          onExpandedRowsChange: setExpandedRowKeys,
        }}
        locale={{
          emptyText: <Empty description="Belum ada data penyulang untuk filter ini" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
        }}
        loading={loading}
        pagination={{
          defaultPageSize: 50,
          pageSizeOptions: [25, 50, 100, 200],
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} baris`,
        }}
        rowClassName={rowSeverityClass}
        rowKey="key"
        scroll={{ x: 1420, y: 560 }}
        showSorterTooltip={false}
        size="middle"
        virtual
        onRow={(row) => ({
          onClick: () => {
            setExpandedRowKeys((current) =>
              current.includes(row.key) ? current.filter((key) => key !== row.key) : [...current, row.key],
            );
          },
        })}
      />
    </div>
  );
}
