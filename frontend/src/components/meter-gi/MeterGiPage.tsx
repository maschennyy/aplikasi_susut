"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Segmented, Space, Typography } from "antd";
import { Gauge, RefreshCw } from "lucide-react";
import { MeterTable } from "@/components/meter-gi/MeterTable";
import styles from "@/components/meter-gi/meter-gi.module.css";
import { CascadeFilter } from "@/components/shared/CascadeFilter";
import { ExportButton } from "@/components/shared/ExportButton";
import { useMeterData, type MeterMode } from "@/hooks/useMeterData";

const { Text, Title } = Typography;

type MeterGiPageProps = {
  mode: MeterMode;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function monthParam(period: string) {
  return `${period.slice(0, 4)}-${period.slice(4, 6)}`;
}

function modeLabel(mode: MeterMode) {
  return mode === "utama" ? "kWh Utama" : "kWh Pembanding";
}

export function MeterGiPage({ mode }: MeterGiPageProps) {
  const meter = useMeterData(mode);
  const periodValue = useMemo(() => dayjs(meter.filters.periode, "YYYYMM"), [meter.filters.periode]);
  const metadata = meter.meter.data.metadata;
  const isBusy = meter.master.isLoading || meter.meter.isLoading;

  const exportParams = useMemo(
    () => ({
      gi_id: meter.filters.giId,
      trafo_id: meter.filters.trafoId,
      periode: meter.filters.periode,
      bulan: monthParam(meter.filters.periode),
      mode,
    }),
    [meter.filters, mode],
  );

  const exportModule = mode === "utama" ? "meter-utama" : "meter-pembanding";

  return (
    <div className={styles.pageStack}>
      <section className={styles.pageToolbar}>
        <div>
          <Title level={2}>{modeLabel(mode)}</Title>
          <Text className={styles.toolbarMeta}>
            Monitoring pembacaan Meter GI, energi import/export, dan anomali untuk periode terpilih.
          </Text>
        </div>

        <div className={styles.toolbarActions}>
          <span className={styles.modeBadge}>{mode === "utama" ? "Meter Utama" : "Meter Pembanding"}</span>
          <ExportButton
            endpoint={`/export/${exportModule}.xlsx`}
            filename={`${exportModule}-${meter.filters.periode}.xlsx`}
            params={exportParams}
          />
        </div>
      </section>

      <Card className={styles.panelCard} variant="borderless">
        <div className={styles.filterRow}>
          <Space wrap size={10}>
            <CascadeFilter
              garduInduk={meter.master.data.garduInduk}
              giId={meter.filters.giId}
              loading={meter.master.isLoading}
              trafo={meter.filteredTrafo}
              trafoId={meter.filters.trafoId}
              onChange={({ giId, trafoId }) => meter.setFilters({ giId, trafoId })}
            />

            <DatePicker
              allowClear={false}
              format="MMMM YYYY"
              picker="month"
              value={periodValue}
              onChange={(value) => {
                if (value) meter.setFilters({ periode: value.format("YYYYMM") });
              }}
            />

            <Segmented
              disabled
              options={[
                { label: "Utama", value: "utama" },
                { label: "Pembanding", value: "pembanding" },
              ]}
              value={mode}
            />
          </Space>

          <Button
            icon={<RefreshCw aria-hidden="true" size={16} />}
            loading={isBusy}
            onClick={() => {
              void Promise.all([meter.refreshMaster(), meter.refreshMeters()]);
            }}
          >
            Refresh
          </Button>
        </div>

        {meter.master.error ? (
          <Alert
            className={styles.tableWrap}
            description={meter.master.error}
            message="Data master tidak bisa dimuat"
            showIcon
            type="warning"
          />
        ) : null}
      </Card>

      <div className={styles.summaryRow}>
        <span className={styles.metricPill}>
          <Gauge aria-hidden="true" size={15} />
          <span>
            Total baris <strong>{metadata.totalRows}</strong>
          </span>
        </span>
        <span className={styles.metricPill}>
          kWh Import <strong>{formatNumber(metadata.totalKwhImport)}</strong>
        </span>
        <span className={styles.metricPill}>
          kWh Export <strong>{formatNumber(metadata.totalKwhExport)}</strong>
        </span>
        <span className={styles.metricPill}>
          MWh Import <strong>{formatNumber(metadata.totalMwhImport)}</strong>
        </span>
        <span className={styles.metricPill}>
          MWh Export <strong>{formatNumber(metadata.totalMwhExport)}</strong>
        </span>
      </div>

      <Card className={styles.panelCard} variant="borderless">
        <MeterTable
          error={meter.meter.error}
          loading={meter.meter.isLoading}
          metadata={metadata}
          mode={mode}
          rows={meter.meter.data.meters}
          onRefresh={meter.refreshMeters}
        />
      </Card>
    </div>
  );
}
