"use client";

import { useMemo } from "react";
import { Skeleton, Space, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { CalendarClock, FilterX, RefreshCw } from "lucide-react";
import { AnomalyBadge } from "@/components/penyulang/AnomalyBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import type { DeviationValue, DeviasiRow } from "@/lib/deviasi";
import { formatNumber, formatPercent } from "@/lib/formatters";
import styles from "./deviasi.module.css";

const { Text } = Typography;

export type DeviasiTableProps = {
  rows: DeviasiRow[];
  loading: boolean;
  error: string | null;
  hasEntityFilters: boolean;
  selectedPeriodLabel: string;
  onPreviousPeriod: () => void;
  onResetFilters: () => void;
  onRefresh: () => Promise<void>;
};

function percentClass(value: DeviationValue) {
  if (value.severity === "alert") return styles.percentAlert;
  if (value.severity === "warning") return styles.percentWarning;
  return styles.percentNormal;
}

function rowClass(row: DeviasiRow) {
  if (row.missingSources.length > 0) return styles.incompleteRow;
  if (row.status === "alert") return styles.alertRow;
  if (row.status === "warning") return styles.warningRow;
  return "";
}

function IdentityCell({ name, code }: { name: string; code: string }) {
  return (
    <div className={styles.primaryCell}>
      <strong>{name}</strong>
      <Text type="secondary">{code}</Text>
    </div>
  );
}

export function DeviasiTable(props: DeviasiTableProps) {
  const columns = useMemo<TableColumnsType<DeviasiRow>>(() => [
    {
      title: "Gardu Induk",
      key: "gi",
      fixed: "left",
      width: 210,
      sorter: (a, b) => a.giNama.localeCompare(b.giNama, "id"),
      render: (_, row) => <IdentityCell code={row.giKode} name={row.giNama} />,
    },
    {
      title: "Trafo",
      key: "trafo",
      fixed: "left",
      width: 190,
      sorter: (a, b) => a.trafoKode.localeCompare(b.trafoKode, "id", { numeric: true }),
      render: (_, row) => <IdentityCell code={row.trafoKode} name={row.trafoNama} />,
    },
    {
      title: "kWh Meter Utama",
      dataIndex: "kwhMeterUtama",
      align: "right",
      width: 170,
      sorter: (a, b) => a.kwhMeterUtama - b.kwhMeterUtama,
      render: (value: number) => <span className={styles.monoCell}>{formatNumber(value)}</span>,
    },
    {
      title: "kWh Meter Pembanding",
      dataIndex: "kwhMeterPembanding",
      align: "right",
      width: 190,
      sorter: (a, b) => a.kwhMeterPembanding - b.kwhMeterPembanding,
      render: (value: number) => <span className={styles.monoCell}>{formatNumber(value)}</span>,
    },
    {
      title: "kWh Penyulang",
      dataIndex: "kwhPenyulang",
      align: "right",
      width: 165,
      sorter: (a, b) => a.kwhPenyulang - b.kwhPenyulang,
      render: (value: number) => <span className={styles.monoCell}>{formatNumber(value)}</span>,
    },
    {
      title: "Deviasi Utama - Pembanding",
      children: [
        {
          title: "kWh",
          key: "muMpKwh",
          align: "right",
          width: 145,
          sorter: (a, b) => a.deviasiUtamaPembanding.kwh - b.deviasiUtamaPembanding.kwh,
          render: (_, row) => <span className={styles.monoCell}>{formatNumber(row.deviasiUtamaPembanding.kwh)}</span>,
        },
        {
          title: "%",
          key: "muMpPercent",
          align: "right",
          width: 125,
          render: (_, row) => <span className={percentClass(row.deviasiUtamaPembanding)}>{formatPercent(row.deviasiUtamaPembanding.percent)}</span>,
        },
      ],
    },
    {
      title: "Deviasi Pembanding - Penyulang",
      children: [
        {
          title: "kWh",
          key: "mpFeederKwh",
          align: "right",
          width: 145,
          sorter: (a, b) => a.deviasiPembandingFeeder.kwh - b.deviasiPembandingFeeder.kwh,
          render: (_, row) => <span className={styles.monoCell}>{formatNumber(row.deviasiPembandingFeeder.kwh)}</span>,
        },
        {
          title: "%",
          key: "mpFeederPercent",
          align: "right",
          width: 125,
          render: (_, row) => <span className={percentClass(row.deviasiPembandingFeeder)}>{formatPercent(row.deviasiPembandingFeeder.percent)}</span>,
        },
      ],
    },
    {
      title: "Status",
      key: "status",
      fixed: "right",
      width: 210,
      render: (_, row) => (
        <Space direction="vertical" size={4}>
          <AnomalyBadge flag={row.statusFlag} />
          {row.missingSources.length > 0 ? <Text className={styles.missingText}>Tidak ada: {row.missingSources.join(", ")}</Text> : null}
        </Space>
      ),
    },
  ], []);

  if (props.loading && props.rows.length === 0) {
    return <div className={styles.tableSkeleton}><Skeleton active paragraph={{ rows: 9 }} /></div>;
  }

  if (props.error) {
    return <EmptyState actionLabel="Coba Lagi" description={props.error} icon={RefreshCw} title="Gagal memuat data deviasi" onAction={() => void props.onRefresh()} />;
  }

  const emptyText = props.hasEntityFilters ? (
    <EmptyState actionLabel="Reset Filter" description="Tidak ada data yang sesuai dengan filter." icon={FilterX} title="Tidak ada data ditemukan" onAction={props.onResetFilters} />
  ) : (
    <EmptyState actionLabel="Lihat Bulan Sebelumnya" description={`Data periode ${props.selectedPeriodLabel} belum tersedia.`} icon={CalendarClock} title="Belum ada data deviasi" onAction={props.onPreviousPeriod} />
  );

  return (
    <div className={styles.tableWrap}>
      <Table<DeviasiRow>
        columns={columns}
        dataSource={props.rows}
        locale={{ emptyText }}
        loading={props.loading}
        pagination={{ defaultPageSize: 25, pageSizeOptions: [25, 50, 100], showSizeChanger: true }}
        rowClassName={rowClass}
        rowKey="key"
        scroll={{ x: 1690, y: 560 }}
        showSorterTooltip={false}
        size="middle"
        virtual
      />
    </div>
  );
}
