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
import type { AnomalyFlag, GarduIndukOption, TrafoOption } from "@/hooks/useFeederData";

export type MeterMode = "utama" | "pembanding";

export type MeterFilters = {
  giId: number | null;
  trafoId: number | null;
  periode: string;
};

export type MeterRow = {
  key: string;
  trafoId: number | null;
  trafoKode: string;
  trafoNama: string;
  giNama: string;
  periode: string;
  mode: MeterMode;
  kwhImport: number;
  kwhExport: number;
  mwhImport: number;
  mwhExport: number;
  tegangan: number | null;
  arus: number | null;
  anomalyFlags: AnomalyFlag[];
  detail: Record<string, unknown>;
};

export type MeterMetadata = {
  totalRows: number;
  totalKwhImport: number;
  totalKwhExport: number;
  totalMwhImport: number;
  totalMwhExport: number;
};

type AsyncState<T> = {
  data: T;
  error: string | null;
  isLoading: boolean;
};

type MeterMasterData = {
  garduInduk: GarduIndukOption[];
  trafo: TrafoOption[];
};

type MeterData = {
  meters: MeterRow[];
  metadata: MeterMetadata;
};

type UseMeterDataResult = {
  filters: MeterFilters;
  master: AsyncState<MeterMasterData>;
  meter: AsyncState<MeterData>;
  filteredTrafo: TrafoOption[];
  setFilters: (nextFilters: Partial<MeterFilters>) => void;
  refreshMaster: () => Promise<void>;
  refreshMeters: () => Promise<void>;
};

const EMPTY_MASTER: MeterMasterData = {
  garduInduk: [],
  trafo: [],
};

const EMPTY_METADATA: MeterMetadata = {
  totalRows: 0,
  totalKwhImport: 0,
  totalKwhExport: 0,
  totalMwhImport: 0,
  totalMwhExport: 0,
};

function normalizeFlag(value: string): AnomalyFlag {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized.includes("NOL")) return "NOL_PEMAKAIAN";
  if (normalized.includes("STAGNAN")) return "STAGNAN";
  if (normalized.includes("LONJAK") || normalized === "NAIK") return "LONJAKAN";
  if (normalized.includes("TURUN")) return "TURUN_DRASTIS";
  if (normalized.includes("POLA") || normalized.includes("DEVIASI")) return "POLA_TIDAK_WAJAR";
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

  const deviasiMuMp = Math.abs(firstNumber(row, ["deviasi_mu_mp"]));
  if (deviasiMuMp >= 1.5 && flags.length === 0) flags.push("POLA_TIDAK_WAJAR");

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

function valueByMode(row: Record<string, unknown>, mode: MeterMode, suffix: string) {
  const prefix = mode === "utama" ? "mu" : "mp";
  return row[`${prefix}_${suffix}`];
}

function normalizeMeterRow(row: Record<string, unknown>, mode: MeterMode, selectedPeriod: string, index: number): MeterRow {
  const modePrefix = mode === "utama" ? "mu" : "mp";
  const kwhImport = firstNumber(
    row,
    ["kwh_import", "import_kwh", `${modePrefix}_kwh_import`, `${modePrefix}_kwh_total`],
    firstNumber(row, [`${modePrefix}_kwh_total`]),
  );
  const kwhExport = firstNumber(row, ["kwh_export", "export_kwh", `${modePrefix}_kwh_export`]);
  const mwhImport = firstNumber(row, ["mwh_import", "import_mwh"], kwhImport / 1000);
  const mwhExport = firstNumber(row, ["mwh_export", "export_mwh"], kwhExport / 1000);
  const trafoId = toNullableNumber(row.trafo_id ?? row.id);
  const periode = periodFromValue(row.periode ?? row.periode_bulan, selectedPeriod);
  const trafoKode = firstString(row, ["trafo_kode", "kode_trafo"]);
  const trafoNama = firstString(row, ["trafo_nama", "nama_trafo", "trafo"], "Trafo Tanpa Nama");

  return {
    key: `${trafoId ?? (trafoKode || trafoNama)}-${mode}-${periode}-${index}`,
    trafoId,
    trafoKode,
    trafoNama,
    giNama: firstString(row, ["gi_nama", "nama_gi", "gardu_induk"], "-"),
    periode,
    mode,
    kwhImport,
    kwhExport,
    mwhImport,
    mwhExport,
    tegangan: toNullableNumber(row.tegangan ?? row.voltage ?? valueByMode(row, mode, "tegangan")),
    arus: toNullableNumber(row.arus ?? row.current ?? valueByMode(row, mode, "arus")),
    anomalyFlags: normalizeFlags(row),
    detail: row,
  };
}

function normalizeMetadata(rows: MeterRow[], rawMetadata: unknown): MeterMetadata {
  const metadata = asRecord(rawMetadata);
  const totalKwhImport = rows.reduce((total, row) => total + row.kwhImport, 0);
  const totalKwhExport = rows.reduce((total, row) => total + row.kwhExport, 0);
  const totalMwhImport = rows.reduce((total, row) => total + row.mwhImport, 0);
  const totalMwhExport = rows.reduce((total, row) => total + row.mwhExport, 0);

  return {
    totalRows: firstNumber(metadata, ["total_rows", "totalRows", "count"], rows.length),
    totalKwhImport: firstNumber(metadata, ["total_kwh_import", "totalKwhImport"], totalKwhImport),
    totalKwhExport: firstNumber(metadata, ["total_kwh_export", "totalKwhExport"], totalKwhExport),
    totalMwhImport: firstNumber(metadata, ["total_mwh_import", "totalMwhImport"], totalMwhImport),
    totalMwhExport: firstNumber(metadata, ["total_mwh_export", "totalMwhExport"], totalMwhExport),
  };
}

function normalizeMeterData(data: unknown, mode: MeterMode, filters: MeterFilters): MeterData {
  const raw = Array.isArray(data) ? { meters: data } : asRecord(data);
  const rows = asArray(raw.meters ?? raw.data ?? raw.rows ?? []).map((row, index) =>
    normalizeMeterRow(row, mode, filters.periode, index),
  );

  return {
    meters: rows,
    metadata: normalizeMetadata(rows, raw.metadata ?? raw),
  };
}

export function currentMeterPeriod() {
  return dayjs().format("YYYYMM");
}

function monthParam(period: string) {
  const normalized = /^\d{6}$/.test(period) ? period : currentMeterPeriod();
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}`;
}

export function useMeterData(mode: MeterMode): UseMeterDataResult {
  const [filters, setFiltersState] = useState<MeterFilters>({
    giId: null,
    trafoId: null,
    periode: currentMeterPeriod(),
  });
  const [master, setMaster] = useState<AsyncState<MeterMasterData>>({
    data: EMPTY_MASTER,
    error: null,
    isLoading: true,
  });
  const [meter, setMeter] = useState<AsyncState<MeterData>>({
    data: { meters: [], metadata: EMPTY_METADATA },
    error: null,
    isLoading: true,
  });
  const masterRequestIdRef = useRef(0);
  const meterRequestIdRef = useRef(0);

  const setFilters = useCallback((nextFilters: Partial<MeterFilters>) => {
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
        error: apiErrorMessage(error, "Gagal memuat data master GI dan trafo."),
        isLoading: false,
      });
    }
  }, []);

  const refreshMeters = useCallback(async () => {
    const requestId = meterRequestIdRef.current + 1;
    meterRequestIdRef.current = requestId;
    setMeter((previous) => ({ ...previous, error: null, isLoading: true }));

    try {
      const response = await api.get<unknown>("/meter-data", {
        params: {
          gi_id: filters.giId || undefined,
          trafo_id: filters.trafoId || undefined,
          periode: filters.periode,
          bulan: monthParam(filters.periode),
          mode,
        },
      });

      if (requestId !== meterRequestIdRef.current) return;

      setMeter({
        data: normalizeMeterData(response.data, mode, filters),
        error: null,
        isLoading: false,
      });
    } catch (error) {
      if (requestId !== meterRequestIdRef.current) return;
      setMeter({
        data: { meters: [], metadata: EMPTY_METADATA },
        error: apiErrorMessage(error, "Gagal memuat data Meter GI."),
        isLoading: false,
      });
    }
  }, [filters, mode]);

  useEffect(() => {
    void refreshMaster();

    return () => {
      masterRequestIdRef.current += 1;
    };
  }, [refreshMaster]);

  useEffect(() => {
    void refreshMeters();

    return () => {
      meterRequestIdRef.current += 1;
    };
  }, [refreshMeters]);

  return {
    filters,
    master,
    meter,
    filteredTrafo,
    setFilters,
    refreshMaster,
    refreshMeters,
  };
}
