"use client";

import { useMemo } from "react";
import { Descriptions, Skeleton, Space, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { CalendarClock, FilterX, RefreshCw } from "lucide-react";
import { AnomalyBadge } from "@/components/penyulang/AnomalyBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import type { MeterMetadata, MeterMode, MeterRow } from "@/hooks/useMeterData";
import styles from "./meter-gi.module.css";

const { Text } = Typography;

type MeterTableProps = {
  rows: MeterRow[];
  metadata: MeterMetadata;
  mode: MeterMode;
  loading: boolean;
  error: string | null;
  hasEntityFilters: boolean;
  selectedPeriodLabel: string;
  onPreviousPeriod: () => void;
  onRefresh: () => Promise<void>;
  onResetFilters: () => void;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function compactValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return NUMBER_FORMATTER.format(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return String(value);
}

export function MeterTable({
  rows,
  metadata,
  mode,
  loading,
  error,
  hasEntityFilters,
  selectedPeriodLabel,
  onPreviousPeriod,
  onRefresh,
  onResetFilters,
}: MeterTableProps) {
  const columns = useMemo<TableColumnsType<MeterRow>>(
    () => [
      {
        title: "Trafo",
        dataIndex: "trafoNama",
        key: "trafoNama",
        fixed: "left",
        sorter: (a, b) => a.trafoNama.localeCompare(b.trafoNama),
        width: 230,
        render: (_, row) => (
          <div className={styles.primaryCell}>
            <strong>{row.trafoNama}</strong>
            <Text type="secondary">{row.trafoKode || "Kode belum tersedia"}</Text>
          </div>
        ),
      },
      {
        title: "GI",
        dataIndex: "giNama",
        key: "giNama",
        sorter: (a, b) => a.giNama.localeCompare(b.giNama),
        width: 190,
      },
      {
        title: "Periode",
        dataIndex: "periode",
        key: "periode",
        width: 120,
        render: (value: string) => <span className={styles.monoCell}>{value}</span>,
      },
      {
        title: "kWh Import",
        dataIndex: "kwhImport",
        key: "kwhImport",
        align: "right",
        sorter: (a, b) => a.kwhImport - b.kwhImport,
        width: 150,
        render: (value: number) => <span className={styles.monoCell}>{formatNumber(value)}</span>,
      },
      {
        title: "kWh Export",
        dataIndex: "kwhExport",
        key: "kwhExport",
        align: "right",
        sorter: (a, b) => a.kwhExport - b.kwhExport,
        width: 150,
        render: (value: number) => <span className={styles.monoCell}>{formatNumber(value)}</span>,
      },
      {
        title: "MWh Import",
        dataIndex: "mwhImport",
        key: "mwhImport",
        align: "right",
        sorter: (a, b) => a.mwhImport - b.mwhImport,
        width: 150,
        render: (value: number) => <span className={styles.monoCell}>{formatNumber(value)}</span>,
      },
      {
        title: "MWh Export",
        dataIndex: "mwhExport",
        key: "mwhExport",
        align: "right",
        sorter: (a, b) => a.mwhExport - b.mwhExport,
        width: 150,
        render: (value: number) => <span className={styles.monoCell}>{formatNumber(value)}</span>,
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
      <EmptyState
        actionLabel="Coba Lagi"
        description="Terjadi kesalahan saat mengambil data. Periksa koneksi atau coba muat ulang."
        icon={RefreshCw}
        title="Gagal memuat data"
        onAction={() => void onRefresh()}
      />
    );
  }

  const emptyText = hasEntityFilters ? (
    <EmptyState
      actionLabel="Reset Filter"
      description="Tidak ada meter GI yang cocok dengan filter yang dipilih. Coba ubah Gardu Induk, Trafo, atau periode."
      icon={FilterX}
      title="Tidak ada data ditemukan"
      onAction={onResetFilters}
    />
  ) : (
    <EmptyState
      actionLabel="Lihat Bulan Sebelumnya"
      description={`Data untuk periode ${selectedPeriodLabel} belum tersedia. Pastikan data sudah diinput atau coba bulan sebelumnya.`}
      icon={CalendarClock}
      title="Belum ada data bulan ini"
      onAction={onPreviousPeriod}
    />
  );

  return (
    <div className={styles.tableWrap}>
      <Table<MeterRow>
        columns={columns}
        dataSource={rows}
        expandable={{
          expandedRowRender: (row) => (
            <Descriptions bordered column={4} size="small">
              {Object.entries(row.detail).slice(0, 20).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {compactValue(value)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          ),
        }}
        locale={{
          emptyText,
        }}
        loading={loading}
        pagination={{
          defaultPageSize: 50,
          pageSizeOptions: [25, 50, 100, 200],
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} baris`,
        }}
        rowKey="key"
        scroll={{ x: 1400, y: 560 }}
        showSorterTooltip={false}
        size="middle"
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}>
                <strong>Summary {mode === "utama" ? "Meter Utama" : "Meter Pembanding"}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell align="right" index={3}>
                <span className={styles.summaryCell}>{formatNumber(metadata.totalKwhImport)}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell align="right" index={4}>
                <span className={styles.summaryCell}>{formatNumber(metadata.totalKwhExport)}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell align="right" index={5}>
                <span className={styles.summaryCell}>{formatNumber(metadata.totalMwhImport)}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell align="right" index={6}>
                <span className={styles.summaryCell}>{formatNumber(metadata.totalMwhExport)}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={7} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
        virtual
      />
    </div>
  );
}
