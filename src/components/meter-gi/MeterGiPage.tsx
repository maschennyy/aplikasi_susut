"use client";

import { useCallback, useMemo } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Segmented, Space, Typography } from "antd";
import { FilterX, Gauge, RefreshCw } from "lucide-react";
import { MeterTable } from "@/components/meter-gi/MeterTable";
import styles from "@/components/meter-gi/meter-gi.module.css";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/shared/ActiveFilterChips";
import { CascadeFilter } from "@/components/shared/CascadeFilter";
import { ExportButton } from "@/components/shared/ExportButton";
import { currentMeterPeriod, useMeterData, type MeterMode } from "@/hooks/useMeterData";
import { formatPeriodLabel, previousPeriod } from "@/lib/period";

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
  const {
    filters,
    master,
    meter,
    filteredTrafo,
    setFilters,
    refreshMaster,
    refreshMeters,
  } = useMeterData(mode);
  const defaultPeriod = currentMeterPeriod();
  const periodValue = useMemo(() => dayjs(filters.periode, "YYYYMM"), [filters.periode]);
  const selectedPeriodLabel = useMemo(() => formatPeriodLabel(filters.periode), [filters.periode]);
  const metadata = meter.data.metadata;
  const isBusy = master.isLoading || meter.isLoading;
  const selectedGi = useMemo(
    () => master.data.garduInduk.find((gi) => gi.id === filters.giId) ?? null,
    [filters.giId, master.data.garduInduk],
  );
  const selectedTrafo = useMemo(
    () => master.data.trafo.find((trafo) => trafo.id === filters.trafoId) ?? null,
    [filters.trafoId, master.data.trafo],
  );
  const hasEntityFilters = Boolean(filters.giId || filters.trafoId);
  const hasActiveFilters = hasEntityFilters || filters.periode !== defaultPeriod;

  const handleResetFilters = useCallback(() => {
    setFilters({
      giId: null,
      trafoId: null,
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
        onClear: () => setFilters({ giId: null, trafoId: null }),
      });
    }

    if (selectedTrafo) {
      chips.push({
        key: "trafo",
        label: "Trafo",
        value: `${selectedTrafo.kode} - ${selectedTrafo.nama}`,
        onClear: () => setFilters({ trafoId: null }),
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
  }, [defaultPeriod, filters.periode, selectedGi, selectedPeriodLabel, selectedTrafo, setFilters]);

  const exportParams = useMemo(
    () => ({
      gi_id: filters.giId,
      trafo_id: filters.trafoId,
      periode: filters.periode,
      bulan: monthParam(filters.periode),
      mode,
    }),
    [filters, mode],
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
            filename={`${exportModule}-${filters.periode}.xlsx`}
            params={exportParams}
          />
        </div>
      </section>

      <Card className={styles.panelCard} variant="borderless">
        <div className={styles.filterRow}>
          <Space wrap size={10}>
            <CascadeFilter
              garduInduk={master.data.garduInduk}
              giId={filters.giId}
              loading={master.isLoading}
              trafo={filteredTrafo}
              trafoId={filters.trafoId}
              onChange={({ giId, trafoId }) => setFilters({ giId, trafoId })}
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
              void Promise.all([refreshMaster(), refreshMeters()]);
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
            description={master.error}
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
          error={meter.error}
          hasEntityFilters={hasEntityFilters}
          loading={meter.isLoading}
          metadata={metadata}
          mode={mode}
          rows={meter.data.meters}
          selectedPeriodLabel={selectedPeriodLabel}
          onPreviousPeriod={handlePreviousPeriod}
          onRefresh={refreshMeters}
          onResetFilters={handleResetFilters}
        />
      </Card>
    </div>
  );
}
