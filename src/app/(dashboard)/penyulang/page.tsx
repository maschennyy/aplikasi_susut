"use client";

import { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Space, Typography } from "antd";
import { FilterX, RefreshCw, Upload, Zap } from "lucide-react";
import { FeederTable } from "@/components/penyulang/FeederTable";
import { UploadModal } from "@/components/penyulang/UploadModal";
import styles from "@/components/penyulang/penyulang.module.css";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/shared/ActiveFilterChips";
import { CascadeFilter } from "@/components/shared/CascadeFilter";
import { ExportButton } from "@/components/shared/ExportButton";
import { useAuth } from "@/hooks/useAuth";
import { currentFeederPeriod, useFeederData } from "@/hooks/useFeederData";
import { formatPeriodLabel, previousPeriod } from "@/lib/period";

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
  const {
    filters,
    pagination,
    master,
    feeder: feederResource,
    filteredTrafo,
    filteredPenyulang,
    setFilters,
    setPagination,
    refreshMaster,
    refreshFeeders,
  } = useFeederData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const canUpload = auth.user?.role === "admin" || auth.user?.role === "operator";

  const defaultPeriod = currentFeederPeriod();
  const periodValue = useMemo(() => dayjs(filters.periode, "YYYYMM"), [filters.periode]);
  const selectedPeriodLabel = useMemo(() => formatPeriodLabel(filters.periode), [filters.periode]);
  const isBusy = master.isLoading || feederResource.isLoading;
  const metadata = feederResource.data.metadata;
  const selectedGi = useMemo(
    () => master.data.garduInduk.find((gi) => gi.id === filters.giId) ?? null,
    [filters.giId, master.data.garduInduk],
  );
  const selectedTrafo = useMemo(
    () => master.data.trafo.find((trafo) => trafo.id === filters.trafoId) ?? null,
    [filters.trafoId, master.data.trafo],
  );
  const selectedPenyulang = useMemo(
    () => master.data.penyulang.find((penyulang) => penyulang.id === filters.penyulangId) ?? null,
    [filters.penyulangId, master.data.penyulang],
  );
  const hasEntityFilters = Boolean(filters.giId || filters.trafoId || filters.penyulangId);
  const hasActiveFilters = hasEntityFilters || filters.periode !== defaultPeriod;

  const handleResetFilters = useCallback(() => {
    setFilters({
      giId: null,
      trafoId: null,
      penyulangId: null,
      periode: defaultPeriod,
    });
  }, [defaultPeriod, setFilters]);

  const handlePreviousPeriod = useCallback(() => {
    setFilters({ periode: previousPeriod(filters.periode) });
  }, [filters.periode, setFilters]);

  const activeFilters = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];

    if (selectedGi) {
      chips.push({
        key: "gi",
        label: "GI",
        value: `${selectedGi.kode} - ${selectedGi.nama}`,
        onClear: () => setFilters({ giId: null, trafoId: null, penyulangId: null }),
      });
    }

    if (selectedTrafo) {
      chips.push({
        key: "trafo",
        label: "Trafo",
        value: `${selectedTrafo.kode} - ${selectedTrafo.nama}`,
        onClear: () => setFilters({ trafoId: null, penyulangId: null }),
      });
    }

    if (selectedPenyulang) {
      chips.push({
        key: "penyulang",
        label: "Penyulang",
        value: `${selectedPenyulang.kode} - ${selectedPenyulang.nama}`,
        onClear: () => setFilters({ penyulangId: null }),
      });
    }

    if (filters.periode !== defaultPeriod) {
      chips.push({
        key: "periode",
        label: "Periode",
        value: selectedPeriodLabel,
        onClear: () => setFilters({ periode: defaultPeriod }),
      });
    }

    return chips;
  }, [defaultPeriod, filters.periode, selectedGi, selectedPeriodLabel, selectedPenyulang, selectedTrafo, setFilters]);

  const exportParams = useMemo(
    () => ({
      gi_id: filters.giId,
      trafo_id: filters.trafoId,
      penyulang_id: filters.penyulangId,
      periode: filters.periode,
      bulan: monthParam(filters.periode),
    }),
    [filters],
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
            filename={`penyulang-${filters.periode}.xlsx`}
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
              garduInduk={master.data.garduInduk}
              giId={filters.giId}
              loading={master.isLoading}
              penyulang={filteredPenyulang}
              penyulangId={filters.penyulangId}
              showPenyulang
              trafo={filteredTrafo}
              trafoId={filters.trafoId}
              onChange={setFilters}
            />

            <DatePicker
              allowClear={false}
              format="MMMM YYYY"
              picker="month"
              value={periodValue}
              onChange={(value) => {
                if (value) setFilters({ periode: value.format("YYYYMM") });
              }}
            />
          </Space>

          <Button
            icon={<RefreshCw aria-hidden="true" size={16} />}
            loading={isBusy}
            onClick={() => {
              void Promise.all([refreshMaster(), refreshFeeders()]);
            }}
          >
            Refresh
          </Button>
          {hasActiveFilters ? (
            <Button
              className={styles.resetFilterButton}
              icon={<FilterX aria-hidden="true" size={15} />}
              size="small"
              type="text"
              onClick={handleResetFilters}
            >
              Reset Filter
            </Button>
          ) : null}
        </div>

        <ActiveFilterChips filters={activeFilters} onResetAll={handleResetFilters} />

        {master.error ? (
          <Alert
            className={styles.tableWrap}
            message="Data master tidak bisa dimuat"
            showIcon
            type="warning"
            description={master.error}
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
          error={feederResource.error}
          hasEntityFilters={hasEntityFilters}
          loading={feederResource.isLoading}
          metadata={metadata}
          pagination={pagination}
          rows={feederResource.data.feeders}
          selectedPeriodLabel={selectedPeriodLabel}
          onPaginationChange={setPagination}
          onPreviousPeriod={handlePreviousPeriod}
          onRefresh={refreshFeeders}
          onResetFilters={handleResetFilters}
        />
      </Card>

      <UploadModal
        filters={filters}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={refreshFeeders}
      />
    </div>
  );
}
