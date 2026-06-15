"use client";

import { useCallback, useMemo } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Space, Typography } from "antd";
import { FilterX, RefreshCw } from "lucide-react";
import { DeviasiSummary } from "@/components/deviasi/DeviasiSummary";
import { DeviasiTable } from "@/components/deviasi/DeviasiTable";
import styles from "@/components/deviasi/deviasi.module.css";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/shared/ActiveFilterChips";
import { CascadeFilter } from "@/components/shared/CascadeFilter";
import { ExportButton } from "@/components/shared/ExportButton";
import { currentDeviasiPeriod, useDeviasiData } from "@/hooks/useDeviasiData";
import { DEVIATION_THRESHOLDS } from "@/lib/deviasi";
import { formatPeriodLabel, previousPeriod } from "@/lib/period";

const { Text, Title } = Typography;

function monthParam(period: string) {
  return `${period.slice(0, 4)}-${period.slice(4, 6)}`;
}

export default function DeviasiPage() {
  const {
    filters,
    master,
    deviasi,
    filteredTrafo,
    setFilters,
    refreshMaster,
    refreshDeviasi,
  } = useDeviasiData();

  const defaultPeriod = currentDeviasiPeriod();
  const periodValue = useMemo(() => dayjs(filters.periode, "YYYYMM"), [filters.periode]);
  const selectedPeriodLabel = useMemo(() => formatPeriodLabel(filters.periode), [filters.periode]);
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
  const isBusy = master.isLoading || deviasi.isLoading;

  const handleResetFilters = useCallback(() => {
    setFilters({ giId: null, trafoId: null, periode: defaultPeriod });
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
    }),
    [filters],
  );

  return (
    <div className={styles.pageStack}>
      <section className={styles.pageToolbar}>
        <div>
          <Title level={2}>Deviasi Energi</Title>
          <Text className={styles.toolbarMeta}>
            Perbandingan meter utama, meter pembanding, dan total kWh penyulang per trafo.
          </Text>
          <Text className={styles.toolbarMeta}>
            Normal &lt; {DEVIATION_THRESHOLDS.normalMaxExclusive}%, warning {DEVIATION_THRESHOLDS.normalMaxExclusive}-{DEVIATION_THRESHOLDS.warningMaxInclusive}%, alert &gt; {DEVIATION_THRESHOLDS.warningMaxInclusive}%.
          </Text>
        </div>

        <div className={styles.toolbarActions}>
          <ExportButton
            endpoint="/export/deviasi.xlsx"
            filename={`deviasi-${filters.periode}.xlsx`}
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
          </Space>

          <Space wrap size={8}>
            <Button
              icon={<RefreshCw aria-hidden="true" size={16} />}
              loading={isBusy}
              onClick={() => void Promise.all([refreshMaster(), refreshDeviasi()])}
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
          </Space>
        </div>

        <ActiveFilterChips filters={activeFilters} onResetAll={handleResetFilters} />

        {master.error ? (
          <Alert
            message="Data master tidak bisa dimuat"
            showIcon
            type="warning"
            description={master.error}
          />
        ) : null}
      </Card>

      <Card className={styles.panelCard} variant="borderless">
        <DeviasiTable
          error={deviasi.error}
          hasEntityFilters={hasEntityFilters}
          loading={deviasi.isLoading}
          rows={deviasi.data.rows}
          selectedPeriodLabel={selectedPeriodLabel}
          onPreviousPeriod={handlePreviousPeriod}
          onRefresh={refreshDeviasi}
          onResetFilters={handleResetFilters}
        />
      </Card>

      <DeviasiSummary loading={deviasi.isLoading} summary={deviasi.data.summary} />
    </div>
  );
}
