"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { api, apiErrorMessage } from "@/lib/api";
import type { GarduIndukOption, TrafoOption } from "@/hooks/useFeederData";
import {
  asArray,
  asRecord,
  firstBoolean,
  firstNumber,
  firstString,
  periodFromValue,
  toNullableNumber,
} from "@/lib/normalizers";
import {
  buildDeviasiRows,
  summarizeDeviasi,
  type DeviasiFeederSource,
  type DeviasiMeterSource,
  type DeviasiRow,
  type DeviasiSummary,
} from "@/lib/deviasi";

export type DeviasiFilters = {
  giId: number | null;
  trafoId: number | null;
  periode: string;
};

type AsyncState<T> = {
  data: T;
  error: string | null;
  isLoading: boolean;
};

type DeviasiMasterData = {
  garduInduk: GarduIndukOption[];
  trafo: TrafoOption[];
};

type DeviasiData = {
  rows: DeviasiRow[];
  summary: DeviasiSummary;
};

type UseDeviasiDataResult = {
  filters: DeviasiFilters;
  master: AsyncState<DeviasiMasterData>;
  deviasi: AsyncState<DeviasiData>;
  filteredTrafo: TrafoOption[];
  setFilters: (nextFilters: Partial<DeviasiFilters>) => void;
  refreshMaster: () => Promise<void>;
  refreshDeviasi: () => Promise<void>;
};

const EMPTY_MASTER: DeviasiMasterData = {
  garduInduk: [],
  trafo: [],
};

const EMPTY_SUMMARY = summarizeDeviasi([]);

function normalizeGarduInduk(data: unknown): GarduIndukOption[] {
  return asArray(data).map((row) => ({
    id: firstNumber(row, ["id", "gi_id"]),
    kode: firstString(row, ["kode", "kode_gi", "gi_kode"], "-"),
    nama: firstString(row, ["nama", "nama_gi", "gi_nama"], "GI Tanpa Nama"),
    areaUnitId: toNullableNumber(row.area_unit_id ?? row.area_id),
    aktif: firstBoolean(row, ["aktif", "active"], true),
  }));
}

function normalizeTrafo(data: unknown): TrafoOption[] {
  return asArray(data).map((row) => ({
    id: firstNumber(row, ["id", "trafo_id"]),
    kode: firstString(row, ["kode", "kode_trafo"], "-"),
    nama: firstString(row, ["nama", "nama_trafo"], "Trafo Tanpa Nama"),
    giId: firstNumber(row, ["gi_id"]),
    kapasitasMva: toNullableNumber(row.kapasitas_mva),
    aktif: firstBoolean(row, ["aktif", "active"], true),
  }));
}

function normalizeMeterSources(data: unknown, mode: "utama" | "pembanding", selectedPeriod: string): DeviasiMeterSource[] {
  const raw = Array.isArray(data) ? { rows: data } : asRecord(data);
  const rows = asArray(raw.meters ?? raw.data ?? raw.rows ?? []);
  const prefix = mode === "utama" ? "mu" : "mp";

  return rows
    .map((row): DeviasiMeterSource | null => {
      const trafoId = toNullableNumber(row.trafo_id ?? row.id);
      if (!trafoId) return null;

      return {
        trafoId,
        giId: toNullableNumber(row.gi_id),
        periode: periodFromValue(row.periode ?? row.periode_bulan, selectedPeriod),
        kwh: firstNumber(
          row,
          [`${prefix}_kwh_total`, "kwh_import", "import_kwh"],
          firstNumber(row, [`${prefix}_kwh_wbp`]) +
            firstNumber(row, [`${prefix}_kwh_lwbp1`]) +
            firstNumber(row, [`${prefix}_kwh_lwbp2`]),
        ),
      };
    })
    .filter((row): row is DeviasiMeterSource => row !== null);
}

function normalizeFeederSources(data: unknown, selectedPeriod: string): DeviasiFeederSource[] {
  const raw = Array.isArray(data) ? { rows: data } : asRecord(data);
  const rows = asArray(raw.feeders ?? raw.data ?? raw.rows ?? []);

  return rows
    .map((row): DeviasiFeederSource | null => {
      const trafoId = toNullableNumber(row.trafo_id);
      if (!trafoId) return null;

      return {
        trafoId,
        giId: toNullableNumber(row.gi_id),
        periode: periodFromValue(row.periode ?? row.periode_bulan, selectedPeriod),
        kwh: firstNumber(row, ["kwh_total", "manual_kwh_total", "register_kwh_hitung", "kwh_hitung"]),
      };
    })
    .filter((row): row is DeviasiFeederSource => row !== null);
}

export function currentDeviasiPeriod() {
  return dayjs().format("YYYYMM");
}

function monthParam(period: string) {
  const normalized = /^\d{6}$/.test(period) ? period : currentDeviasiPeriod();
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}`;
}

export function useDeviasiData(): UseDeviasiDataResult {
  const [filters, setFiltersState] = useState<DeviasiFilters>({
    giId: null,
    trafoId: null,
    periode: currentDeviasiPeriod(),
  });
  const [master, setMaster] = useState<AsyncState<DeviasiMasterData>>({
    data: EMPTY_MASTER,
    error: null,
    isLoading: true,
  });
  const [deviasi, setDeviasi] = useState<AsyncState<DeviasiData>>({
    data: { rows: [], summary: EMPTY_SUMMARY },
    error: null,
    isLoading: true,
  });
  const masterRequestIdRef = useRef(0);
  const deviasiRequestIdRef = useRef(0);

  const setFilters = useCallback((nextFilters: Partial<DeviasiFilters>) => {
    setFiltersState((previous) => ({ ...previous, ...nextFilters }));
  }, []);

  const filteredTrafo = useMemo(() => {
    if (!filters.giId) return master.data.trafo;
    return master.data.trafo.filter((trafo) => trafo.giId === filters.giId);
  }, [filters.giId, master.data.trafo]);

  const refreshMaster = useCallback(async () => {
    const requestId = masterRequestIdRef.current + 1;
    masterRequestIdRef.current = requestId;
    setMaster((previous) => ({ ...previous, error: null, isLoading: true }));

    try {
      const [garduIndukResponse, trafoResponse] = await Promise.all([
        api.get<unknown>("/gardu-induk"),
        api.get<unknown>("/trafo"),
      ]);

      if (requestId !== masterRequestIdRef.current) return;

      setMaster({
        data: {
          garduInduk: normalizeGarduInduk(garduIndukResponse.data),
          trafo: normalizeTrafo(trafoResponse.data),
        },
        error: null,
        isLoading: false,
      });
    } catch (error) {
      if (requestId !== masterRequestIdRef.current) return;
      setMaster({
        data: EMPTY_MASTER,
        error: apiErrorMessage(error, "Gagal memuat master Gardu Induk dan trafo."),
        isLoading: false,
      });
    }
  }, []);

  const refreshDeviasi = useCallback(async () => {
    const requestId = deviasiRequestIdRef.current + 1;
    deviasiRequestIdRef.current = requestId;
    setDeviasi((previous) => ({ ...previous, error: null, isLoading: true }));

    const params = {
      gi_id: filters.giId || undefined,
      trafo_id: filters.trafoId || undefined,
      periode: filters.periode,
      bulan: monthParam(filters.periode),
    };

    try {
      const [utamaResponse, pembandingResponse, feederResponse] = await Promise.all([
        api.get<unknown>("/meter-data", { params: { ...params, mode: "utama" } }),
        api.get<unknown>("/meter-data", { params: { ...params, mode: "pembanding" } }),
        api.get<unknown>("/feeder-data", { params }),
      ]);

      if (requestId !== deviasiRequestIdRef.current) return;

      const rows = buildDeviasiRows({
        garduInduk: master.data.garduInduk,
        trafo: master.data.trafo,
        meterUtama: normalizeMeterSources(utamaResponse.data, "utama", filters.periode),
        meterPembanding: normalizeMeterSources(pembandingResponse.data, "pembanding", filters.periode),
        feeder: normalizeFeederSources(feederResponse.data, filters.periode),
        periode: monthParam(filters.periode),
      });

      setDeviasi({
        data: {
          rows,
          summary: summarizeDeviasi(rows),
        },
        error: null,
        isLoading: false,
      });
    } catch (error) {
      if (requestId !== deviasiRequestIdRef.current) return;
      setDeviasi({
        data: { rows: [], summary: EMPTY_SUMMARY },
        error: apiErrorMessage(error, "Gagal memuat dan menghitung data deviasi."),
        isLoading: false,
      });
    }
  }, [filters, master.data.garduInduk, master.data.trafo]);

  useEffect(() => {
    void refreshMaster();
    return () => {
      masterRequestIdRef.current += 1;
    };
  }, [refreshMaster]);

  useEffect(() => {
    void refreshDeviasi();
    return () => {
      deviasiRequestIdRef.current += 1;
    };
  }, [refreshDeviasi]);

  return {
    filters,
    master,
    deviasi,
    filteredTrafo,
    setFilters,
    refreshMaster,
    refreshDeviasi,
  };
}
