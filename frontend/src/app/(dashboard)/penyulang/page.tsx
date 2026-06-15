"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Space, Typography } from "antd";
import { RefreshCw, Upload, Zap } from "lucide-react";
import { FeederTable } from "@/components/penyulang/FeederTable";
import { UploadModal } from "@/components/penyulang/UploadModal";
import styles from "@/components/penyulang/penyulang.module.css";
import { CascadeFilter } from "@/components/shared/CascadeFilter";
import { ExportButton } from "@/components/shared/ExportButton";
import { useAuth } from "@/hooks/useAuth";
import { useFeederData } from "@/hooks/useFeederData";

const { Text, Title } = Typography;

const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

function formatKwh(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function monthParam(period: string) {
  return `${period.slice(0, 4)}-${period.slice(4, 6)}`;
}

export default function PenyulangPage() {
  const auth = useAuth();
  const feeder = useFeederData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const canUpload = auth.user?.role === "admin" || auth.user?.role === "operator";

  const periodValue = useMemo(() => dayjs(feeder.filters.periode, "YYYYMM"), [feeder.filters.periode]);
  const isBusy = feeder.master.isLoading || feeder.feeder.isLoading;
  const metadata = feeder.feeder.data.metadata;

  const exportParams = useMemo(
    () => ({
      gi_id: feeder.filters.giId,
      trafo_id: feeder.filters.trafoId,
      penyulang_id: feeder.filters.penyulangId,
      periode: feeder.filters.periode,
      bulan: monthParam(feeder.filters.periode),
    }),
    [feeder.filters],
  );

  return (
    <div className={styles.pageStack}>
      <section className={styles.pageToolbar}>
        <div>
          <Title level={2}>kWh Penyulang</Title>
          <Text className={styles.toolbarMeta}>
            Monitoring energi kirim, energi terima, susut, dan anomali penyulang per periode.
          </Text>
        </div>

        <div className={styles.toolbarActions}>
          <ExportButton
            endpoint="/export/penyulang.xlsx"
            filename={`penyulang-${feeder.filters.periode}.xlsx`}
            params={exportParams}
          />

          {canUpload ? (
            <Button icon={<Upload aria-hidden="true" size={16} />} type="primary" onClick={() => setUploadOpen(true)}>
              Upload Data Penyulang
            </Button>
          ) : null}
        </div>
      </section>

      <Card className={styles.panelCard} variant="borderless">
        <div className={styles.filterRow}>
          <Space wrap size={10}>
            <CascadeFilter
              garduInduk={feeder.master.data.garduInduk}
              giId={feeder.filters.giId}
              loading={feeder.master.isLoading}
              penyulang={feeder.filteredPenyulang}
              penyulangId={feeder.filters.penyulangId}
              showPenyulang
              trafo={feeder.filteredTrafo}
              trafoId={feeder.filters.trafoId}
              onChange={feeder.setFilters}
            />

            <DatePicker
              allowClear={false}
              format="MMMM YYYY"
              picker="month"
              value={periodValue}
              onChange={(value) => {
                if (value) feeder.setFilters({ periode: value.format("YYYYMM") });
              }}
            />
          </Space>

          <Button
            icon={<RefreshCw aria-hidden="true" size={16} />}
            loading={isBusy}
            onClick={() => {
              void Promise.all([feeder.refreshMaster(), feeder.refreshFeeders()]);
            }}
          >
            Refresh
          </Button>
        </div>

        {feeder.master.error ? (
          <Alert
            className={styles.tableWrap}
            message="Data master tidak bisa dimuat"
            showIcon
            type="warning"
            description={feeder.master.error}
          />
        ) : null}
      </Card>

      <div className={styles.summaryRow}>
        <span className={styles.metricPill}>
          <Zap aria-hidden="true" size={15} />
          <span>
            Total baris <strong>{metadata.totalRows}</strong>
          </span>
        </span>
        <span className={styles.metricPill}>
          kWh Kirim <strong>{formatKwh(metadata.totalKwhKirim)}</strong>
        </span>
        <span className={styles.metricPill}>
          kWh Terima <strong>{formatKwh(metadata.totalKwhTerima)}</strong>
        </span>
        <span className={styles.metricPill}>
          Susut kWh <strong>{formatKwh(metadata.totalSusutKwh)}</strong>
        </span>
      </div>

      <Card className={styles.panelCard} variant="borderless">
        <FeederTable
          error={feeder.feeder.error}
          loading={feeder.feeder.isLoading}
          metadata={metadata}
          rows={feeder.feeder.data.feeders}
          onRefresh={feeder.refreshFeeders}
        />
      </Card>

      <UploadModal
        filters={feeder.filters}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={feeder.refreshFeeders}
      />
    </div>
  );
}
