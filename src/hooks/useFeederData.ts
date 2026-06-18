"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { api, apiErrorMessage } from "@/lib/api";
import {
  asArray,
  asRecord,
  firstBoolean,
  firstNumber,
  firstString,
  periodFromValue,
  toNullableNumber,
} from "@/lib/normalizers";

export type GarduIndukOption = {
  id: number;
  kode: string;
  nama: string;
  areaUnitId: number | null;
  aktif: boolean;
};

export type TrafoOption = {
  id: number;
  kode: string;
  nama: string;
  giId: number;
  kapasitasMva: number | null;
  aktif: boolean;
};

export type PenyulangOption = {
  id: number;
  kode: string;
  nama: string;
  trafoId: number;
  giId: number | null;
  aktif: boolean;
};

export type AnomalyFlag =
  | "TURUN_DRASTIS"
  | "STAGNAN"
  | "NOL_PEMAKAIAN"
  | "LONJAKAN"
  | "POLA_TIDAK_WAJAR"
  | "NAIK"
  | "TURUN"
  | string;

export type FeederRow = {
  key: string;
  penyulangId: number | null;
  penyulangKode: string;
  penyulangNama: string;
  trafoNama: string;
  giNama: string;
  periode: string;
  kwhKirim: number;
  kwhTerima: number;
  susutKwh: number;
  susutPersen: number;
  anomalyFlags: AnomalyFlag[];
  detail: Record<string, unknown>;
};

export type FeederMetadata = {
  totalRows: number;
  totalKwhKirim: number;
  totalKwhTerima: number;
  totalSusutKwh: number;
  avgSusutPersen: number;
};

export type FeederFilters = {
  giId: number | null;
  trafoId: number | null;
  penyulangId: number | null;
  periode: string;
};

type AsyncState<T> = {
  data: T;
  error: string | null;
  isLoading: boolean;
};

type MasterData = {
  garduInduk: GarduIndukOption[];
  trafo: TrafoOption[];
  penyulang: PenyulangOption[];
};

type FeederData = {
  feeders: FeederRow[];
  metadata: FeederMetadata;
};

type UseFeederDataResult = {
  filters: FeederFilters;
  master: AsyncState<MasterData>;
  feeder: AsyncState<FeederData>;
  filteredTrafo: TrafoOption[];
  filteredPenyulang: PenyulangOption[];
  setFilters: (nextFilters: Partial<FeederFilters>) => void;
  refreshMaster: () => Promise<void>;
  refreshFeeders: () => Promise<void>;
};

const EMPTY_MASTER: MasterData = {
  garduInduk: [],
  trafo: [],
  penyulang: [],
};

const EMPTY_METADATA: FeederMetadata = {
  totalRows: 0,
  totalKwhKirim: 0,
  totalKwhTerima: 0,
  totalSusutKwh: 0,
  avgSusutPersen: 0,
};

function normalizeFlag(value: string): AnomalyFlag {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "NAIK") return "LONJAKAN";
  if (normalized === "TURUN") return "TURUN_DRASTIS";
  if (normalized.includes("NOL")) return "NOL_PEMAKAIAN";
  if (normalized.includes("STAGNAN")) return "STAGNAN";
  if (normalized.includes("LONJAK")) return "LONJAKAN";
  if (normalized.includes("TURUN")) return "TURUN_DRASTIS";
  if (normalized.includes("POLA")) return "POLA_TIDAK_WAJAR";
  return normalized;
}

function normalizeFlags(row: Record<string, unknown>) {
  const rawFlags = row.anomaly_flags ?? row.flags;
  const flags = Array.isArray(rawFlags)
    ? rawFlags.filter((flag): flag is string => typeof flag === "string")
    : typeof rawFlags === "string"
      ? rawFlags.split(/[;,|]/)
      : [];

  const anomalyType = firstString(row, ["anomaly_type", "jenis_anomali"]);
  if (anomalyType) flags.push(anomalyType);

  const hasAlert = Boolean(row.flag_alert);
  if (hasAlert && flags.length === 0) flags.push("POLA_TIDAK_WAJAR");

  return Array.from(new Set(flags.map(normalizeFlag).filter(Boolean)));
}

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

function normalizePenyulang(data: unknown): PenyulangOption[] {
  return asArray(data).map((row) => ({
    id: firstNumber(row, ["id", "penyulang_id"]),
    kode: firstString(row, ["kode", "kode_penyulang"], "-"),
    nama: firstString(row, ["nama", "nama_penyulang"], "Penyulang Tanpa Nama"),
    trafoId: firstNumber(row, ["trafo_id"]),
    giId: toNullableNumber(row.gi_id),
    aktif: firstBoolean(row, ["aktif", "active"], true),
  }));
}

function normalizeFeederRow(row: Record<string, unknown>, selectedPeriod: string, index: number): FeederRow {
  const kwhKirim = firstNumber(row, ["kwh_kirim", "kwh_hitung", "register_kwh_hitung"], firstNumber(row, ["kwh_total"]));
  const kwhTerima = firstNumber(row, ["kwh_terima", "kwh_total", "manual_kwh_total"]);
  const susutKwh = firstNumber(row, ["susut_kwh", "deviasi_kwh"], kwhKirim - kwhTerima);
  const susutPersen = firstNumber(
    row,
    ["susut_persen", "deviasi_persen"],
    kwhKirim > 0 ? (susutKwh / kwhKirim) * 100 : 0,
  );
  const penyulangId = toNullableNumber(row.penyulang_id ?? row.id);
  const periode = periodFromValue(row.periode ?? row.periode_bulan, selectedPeriod);
  const penyulangKode = firstString(row, ["penyulang_kode", "kode_penyulang"]);
  const penyulangNama = firstString(row, ["penyulang_nama", "nama_penyulang", "penyulang"], "Penyulang Tanpa Nama");

  return {
    key: `${penyulangId ?? (penyulangKode || penyulangNama)}-${periode}-${index}`,
    penyulangId,
    penyulangKode,
    penyulangNama,
    trafoNama: firstString(row, ["trafo_nama", "nama_trafo", "trafo", "kode_trafo"], "-"),
    giNama: firstString(row, ["gi_nama", "nama_gi", "gardu_induk"], "-"),
    periode,
    kwhKirim,
    kwhTerima,
    susutKwh,
    susutPersen,
    anomalyFlags: normalizeFlags(row),
    detail: row,
  };
}

function normalizeMetadata(rows: FeederRow[], rawMetadata: unknown): FeederMetadata {
  const metadata = asRecord(rawMetadata);
  const totalKwhKirim = rows.reduce((total, row) => total + row.kwhKirim, 0);
  const totalKwhTerima = rows.reduce((total, row) => total + row.kwhTerima, 0);
  const totalSusutKwh = rows.reduce((total, row) => total + row.susutKwh, 0);
  const avgSusutPersen = rows.length ? rows.reduce((total, row) => total + row.susutPersen, 0) / rows.length : 0;

  return {
    totalRows: firstNumber(metadata, ["total_rows", "totalRows", "count"], rows.length),
    totalKwhKirim: firstNumber(metadata, ["total_kwh_kirim", "totalKwhKirim"], totalKwhKirim),
    totalKwhTerima: firstNumber(metadata, ["total_kwh_terima", "totalKwhTerima"], totalKwhTerima),
    totalSusutKwh: firstNumber(metadata, ["total_susut_kwh", "totalSusutKwh"], totalSusutKwh),
    avgSusutPersen: firstNumber(metadata, ["avg_susut_persen", "avgSusutPersen"], avgSusutPersen),
  };
}

function normalizeFeederData(data: unknown, filters: FeederFilters): FeederData {
  const raw = Array.isArray(data) ? { feeders: data } : asRecord(data);
  const rows = asArray(raw.feeders ?? raw.data ?? raw.rows ?? []).map((row, index) =>
    normalizeFeederRow(row, filters.periode, index),
  );
  const selectedRows = filters.penyulangId
    ? rows.filter((row) => row.penyulangId === filters.penyulangId)
    : rows;

  return {
    feeders: selectedRows,
    metadata: normalizeMetadata(selectedRows, raw.metadata ?? raw),
  };
}

export function currentFeederPeriod() {
  return dayjs().format("YYYYMM");
}

function monthParam(period: string) {
  const normalized = /^\d{6}$/.test(period) ? period : currentFeederPeriod();
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}`;
}

export function useFeederData(): UseFeederDataResult {
  const [filters, setFiltersState] = useState<FeederFilters>({
    giId: null,
    trafoId: null,
    penyulangId: null,
    periode: currentFeederPeriod(),
  });
  const [master, setMaster] = useState<AsyncState<MasterData>>({
    data: EMPTY_MASTER,
    error: null,
    isLoading: true,
  });
  const [feeder, setFeeder] = useState<AsyncState<FeederData>>({
    data: { feeders: [], metadata: EMPTY_METADATA },
    error: null,
    isLoading: true,
  });
  const masterRequestIdRef = useRef(0);
  const feederRequestIdRef = useRef(0);

  const setFilters = useCallback((nextFilters: Partial<FeederFilters>) => {
    setFiltersState((previous) => ({ ...previous, ...nextFilters }));
  }, []);

  const filteredTrafo = useMemo(() => {
    if (!filters.giId) return master.data.trafo;
    return master.data.trafo.filter((trafo) => trafo.giId === filters.giId);
  }, [filters.giId, master.data.trafo]);

  const filteredPenyulang = useMemo(() => {
    return master.data.penyulang.filter((penyulang) => {
      if (filters.trafoId) return penyulang.trafoId === filters.trafoId;
      if (filters.giId) return penyulang.giId === filters.giId;
      return true;
    });
  }, [filters.giId, filters.trafoId, master.data.penyulang]);

  const refreshMaster = useCallback(async () => {
    const requestId = masterRequestIdRef.current + 1;
    masterRequestIdRef.current = requestId;
    setMaster((previous) => ({ ...previous, error: null, isLoading: true }));

    try {
      const [garduIndukResponse, trafoResponse, penyulangResponse] = await Promise.all([
        api.get<unknown>("/gardu-induk"),
        api.get<unknown>("/trafo"),
        api.get<unknown>("/penyulang"),
      ]);

      if (requestId !== masterRequestIdRef.current) return;

      setMaster({
        data: {
          garduInduk: normalizeGarduInduk(garduIndukResponse.data),
          trafo: normalizeTrafo(trafoResponse.data),
          penyulang: normalizePenyulang(penyulangResponse.data),
        },
        error: null,
        isLoading: false,
      });
    } catch (error) {
      if (requestId !== masterRequestIdRef.current) return;
      setMaster({
        data: EMPTY_MASTER,
        error: apiErrorMessage(error, "Gagal memuat data master GI, trafo, dan penyulang."),
        isLoading: false,
      });
    }
  }, []);

  const refreshFeeders = useCallback(async () => {
    const requestId = feederRequestIdRef.current + 1;
    feederRequestIdRef.current = requestId;
    setFeeder((previous) => ({ ...previous, error: null, isLoading: true }));

    try {
      const response = await api.get<unknown>("/feeder-data", {
        params: {
          gi_id: filters.giId || undefined,
          trafo_id: filters.trafoId || undefined,
          penyulang_id: filters.penyulangId || undefined,
          periode: filters.periode,
          bulan: monthParam(filters.periode),
        },
      });

      if (requestId !== feederRequestIdRef.current) return;

      setFeeder({
        data: normalizeFeederData(response.data, filters),
        error: null,
        isLoading: false,
      });
    } catch (error) {
      if (requestId !== feederRequestIdRef.current) return;
      setFeeder({
        data: { feeders: [], metadata: EMPTY_METADATA },
        error: apiErrorMessage(error, "Gagal memuat data kWh penyulang."),
        isLoading: false,
      });
    }
  }, [filters]);

  useEffect(() => {
    void refreshMaster();

    return () => {
      masterRequestIdRef.current += 1;
    };
  }, [refreshMaster]);

  useEffect(() => {
    void refreshFeeders();

    return () => {
      feederRequestIdRef.current += 1;
    };
  }, [refreshFeeders]);

  return {
    filters,
    master,
    feeder,
    filteredTrafo,
    filteredPenyulang,
    setFilters,
    refreshMaster,
    refreshFeeders,
  };
}
