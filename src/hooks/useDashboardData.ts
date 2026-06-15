"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { api, apiErrorMessage } from "@/lib/api";

export type ResourceState<T> = {
  data: T | null;
  error: string | null;
  isLoading: boolean;
};

export type KpiData = {
  totalGi: number;
  giAktif: number;
  rataSusutPersen: number;
  totalKwhMasuk: number;
  totalKwhKeluar: number;
};

export type MonthlySusutPoint = {
  key: string;
  periode: string;
  monthLabel: string;
  giName: string;
  kwhMasuk: number;
  kwhKeluar: number;
  susutKwh: number;
  susutPersen: number;
};

export type DeviasiGiRow = {
  key: string;
  giName: string;
  kwhMasuk: number;
  kwhKeluar: number;
  susutKwh: number;
  susutPersen: number;
  status: "normal" | "warning" | "alert";
};

export type AnomalyItem = {
  key: string;
  title: string;
  subtitle: string;
  metric: string;
  severity: "normal" | "warning" | "alert";
};

export type WorkflowMonth = {
  key: string;
  periode: string;
  monthLabel: string;
  status: "draft" | "pending" | "finalized" | "locked";
  label: string;
  isLocked: boolean;
};

export type DashboardData = {
  monthlyData: MonthlySusutPoint[];
  totalSusut: {
    kwhMasuk: number;
    kwhKeluar: number;
    susutKwh: number;
    susutPersen: number;
  };
};

export type ExecutiveDashboardData = {
  kpi: KpiData;
  deviasiGi: DeviasiGiRow[];
  anomalies: AnomalyItem[];
  workflowCounts: {
    draft: number;
    pending: number;
    finalized: number;
    locked: number;
  };
};

export type DashboardQuery = {
  periode: string;
  year: number;
  month: number;
  bulan: string;
};

type DashboardHookState = {
  dashboard: ResourceState<DashboardData>;
  executive: ResourceState<ExecutiveDashboardData>;
  workflow: ResourceState<WorkflowMonth[]>;
  query: DashboardQuery;
  refetch: () => Promise<void>;
};

type SafeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const EMPTY_RESOURCE = {
  data: null,
  error: null,
  isLoading: true,
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function firstNumber(record: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return toNumber(record[key], fallback);
    }
  }
  return fallback;
}

function firstString(record: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function periodFromValue(value: unknown, fallbackPeriod: string) {
  if (typeof value === "string" && /^\d{6}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) {
    return value.slice(0, 7);
  }
  return `${fallbackPeriod.slice(0, 4)}-${fallbackPeriod.slice(4, 6)}`;
}

function monthLabel(periode: string) {
  const monthIndex = Number(periode.slice(5, 7)) - 1;
  return MONTH_LABELS[monthIndex] || periode;
}

function deviasiStatus(value: number): DeviasiGiRow["status"] {
  const absValue = Math.abs(value);
  if (absValue >= 1.5) return "alert";
  if (absValue >= 0.75) return "warning";
  return "normal";
}

function anomalySeverity(value: number): AnomalyItem["severity"] {
  const absValue = Math.abs(value);
  if (absValue >= 25) return "alert";
  if (absValue >= 10) return "warning";
  return "normal";
}

function normalizeDashboard(rawValue: unknown, selectedPeriod: string): DashboardData {
  const raw = asRecord(rawValue);
  const monthlyRows = asArray(raw.monthly_data ?? raw.data_bulanan ?? raw.rows ?? []);
  const monthlyData = monthlyRows.map((row, index) => {
    const periode = periodFromValue(row.periode ?? row.periode_bulan ?? row.tanggal, selectedPeriod);
    const kwhMasuk = firstNumber(row, ["kwh_masuk", "total_kwh_masuk", "meter_utama", "mu", "mu_total"]);
    const kwhKeluar = firstNumber(row, ["kwh_keluar", "total_kwh_keluar", "total_penyulang", "penyulang", "feeder_total"]);
    const susutKwh = firstNumber(row, ["susut_kwh", "total_susut", "deviasi_kwh"], kwhMasuk - kwhKeluar);
    const susutPersen = firstNumber(row, ["susut_persen", "persentase_susut", "persentase_total"]);

    return {
      key: `${periode}-${firstString(row, ["gi_id", "gi_name", "nama_gi"], String(index))}`,
      periode,
      monthLabel: monthLabel(periode),
      giName: firstString(row, ["gi_name", "nama_gi", "gardu_induk"], "Semua GI"),
      kwhMasuk,
      kwhKeluar,
      susutKwh,
      susutPersen,
    };
  });

  const total = asRecord(raw.total_susut ?? raw.total ?? {});
  const kwhMasuk = firstNumber(total, ["kwh_masuk", "total_kwh_masuk", "meter_utama"]);
  const kwhKeluar = firstNumber(total, ["kwh_keluar", "total_kwh_keluar", "total_penyulang"]);
  const susutKwh = firstNumber(total, ["susut_kwh", "total_susut"], kwhMasuk - kwhKeluar);
  const susutPersen = firstNumber(total, ["susut_persen", "persentase_total"]);

  return {
    monthlyData,
    totalSusut: {
      kwhMasuk,
      kwhKeluar,
      susutKwh,
      susutPersen,
    },
  };
}

function normalizeDeviasiRows(raw: Record<string, unknown>): DeviasiGiRow[] {
  const rows = asArray(raw.deviasi_gi ?? raw.gi_deviasi_terbesar ?? raw.rows ?? []);

  return rows.map((row, index) => {
    const kwhMasuk = firstNumber(row, ["kwh_masuk", "total_kwh_masuk", "meter_utama", "mu_total"]);
    const kwhKeluar = firstNumber(row, ["kwh_keluar", "total_kwh_keluar", "penyulang", "total_penyulang", "feeder_total"]);
    const susutKwh = firstNumber(row, ["susut_kwh", "deviasi_kwh"], kwhMasuk - kwhKeluar);
    const susutPersen = firstNumber(row, ["susut_persen", "deviasi_persen"]);
    const giName = firstString(row, ["gi_name", "nama_gi", "gardu_induk"], `GI ${index + 1}`);

    return {
      key: firstString(row, ["gi_id", "kode_gi"], `${giName}-${index}`),
      giName,
      kwhMasuk,
      kwhKeluar,
      susutKwh,
      susutPersen,
      status: deviasiStatus(susutPersen),
    };
  });
}

function normalizeAnomalies(raw: Record<string, unknown>): AnomalyItem[] {
  const rows = asArray(raw.anomali ?? raw.anomalies ?? raw.penyulang_anomali ?? []);

  return rows.map((row, index) => {
    const deviasi = firstNumber(row, ["severity_value", "deviasi_persen", "susut_persen"]);
    const title = firstString(row, ["title", "penyulang", "nama_penyulang"], `Anomali ${index + 1}`);
    const gi = firstString(row, ["gi_name", "gardu_induk", "nama_gi"], "GI belum diketahui");
    const type = firstString(row, ["severity", "anomaly_type", "status"], "Deviasi");

    return {
      key: firstString(row, ["id", "kode_penyulang"], `${title}-${index}`),
      title,
      subtitle: `${gi} - ${type}`,
      metric: `${deviasi.toFixed(2)}%`,
      severity: anomalySeverity(deviasi),
    };
  });
}

function normalizeWorkflowCounts(raw: Record<string, unknown>) {
  const workflow = asRecord(raw.workflow ?? {});
  return {
    draft: firstNumber(workflow, ["draft", "DRAFT"]),
    pending: firstNumber(workflow, ["pending", "SUDAH_UPLOAD", "SUDAH_DICEK"]),
    finalized: firstNumber(workflow, ["finalized", "final", "FINAL"]),
    locked: firstNumber(workflow, ["locked", "terkunci", "TERKUNCI"]),
  };
}

function normalizeExecutive(rawValue: unknown, dashboard: DashboardData | null): ExecutiveDashboardData {
  const raw = asRecord(rawValue);
  const rawKpi = asRecord(raw.kpi ?? {});
  const deviasiGi = normalizeDeviasiRows(raw);
  const anomalies = normalizeAnomalies(raw);
  const fallbackTotal = dashboard?.totalSusut;

  return {
    kpi: {
      totalGi: firstNumber(rawKpi, ["total_gi"], deviasiGi.length),
      giAktif: firstNumber(rawKpi, ["gi_aktif", "active_gi"], deviasiGi.length),
      rataSusutPersen: firstNumber(rawKpi, ["rata_susut_persen", "avg_susut_persen"], firstNumber(raw, ["susut_persen"], fallbackTotal?.susutPersen ?? 0)),
      totalKwhMasuk: firstNumber(rawKpi, ["total_kwh_masuk"], firstNumber(raw, ["total_kwh_masuk"], fallbackTotal?.kwhMasuk ?? 0)),
      totalKwhKeluar: firstNumber(rawKpi, ["total_kwh_keluar"], firstNumber(raw, ["total_kwh_keluar"], fallbackTotal?.kwhKeluar ?? 0)),
    },
    deviasiGi,
    anomalies,
    workflowCounts: normalizeWorkflowCounts(raw),
  };
}

function normalizeWorkflow(rawValue: unknown, selectedYear: number): WorkflowMonth[] {
  const raw = Array.isArray(rawValue) ? { rows: rawValue } : asRecord(rawValue);
  const rows = asArray(raw.rows ?? raw.months ?? raw.data ?? []);
  const byMonth = new Map<number, Record<string, unknown>>();

  for (const row of rows) {
    const periode = periodFromValue(row.periode ?? row.periode_bulan, `${selectedYear}01`);
    const month = Number(periode.slice(5, 7));
    if (month >= 1 && month <= 12) byMonth.set(month, row);
  }

  return MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const row = byMonth.get(month);
    const rawStatus = firstString(row ?? {}, ["status"], "DRAFT").toUpperCase();
    const isLocked = Boolean(row?.is_locked) || Boolean(row?.locked_at) || rawStatus === "TERKUNCI";
    const status: WorkflowMonth["status"] = isLocked
      ? "locked"
      : rawStatus === "FINAL" || rawStatus === "FINALIZED"
        ? "finalized"
        : rawStatus === "SUDAH_UPLOAD" || rawStatus === "SUDAH_DICEK" || rawStatus === "PENDING"
          ? "pending"
          : "draft";

    return {
      key: `${selectedYear}-${String(month).padStart(2, "0")}`,
      periode: `${selectedYear}-${String(month).padStart(2, "0")}`,
      monthLabel: label,
      status,
      label: firstString(row ?? {}, ["label"], status),
      isLocked,
    };
  });
}

async function safeRequest<T>(request: Promise<{ data: unknown }>, normalize: (data: unknown) => T): Promise<SafeResult<T>> {
  try {
    const response = await request;
    return { ok: true, value: normalize(response.data) };
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) };
  }
}

function queryFromPeriod(period: string): DashboardQuery {
  const normalized = /^\d{6}$/.test(period) ? period : dayjs().format("YYYYMM");
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));

  return {
    periode: normalized,
    year,
    month,
    bulan: `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}`,
  };
}

export function currentDashboardPeriod() {
  return dayjs().format("YYYYMM");
}

export function useDashboardData(period: string): DashboardHookState {
  const query = useMemo(() => queryFromPeriod(period), [period]);
  const requestIdRef = useRef(0);
  const [dashboard, setDashboard] = useState<ResourceState<DashboardData>>(EMPTY_RESOURCE);
  const [executive, setExecutive] = useState<ResourceState<ExecutiveDashboardData>>(EMPTY_RESOURCE);
  const [workflow, setWorkflow] = useState<ResourceState<WorkflowMonth[]>>(EMPTY_RESOURCE);

  const refetch = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setDashboard((previous) => ({ ...previous, error: null, isLoading: true }));
    setExecutive((previous) => ({ ...previous, error: null, isLoading: true }));
    setWorkflow((previous) => ({ ...previous, error: null, isLoading: true }));

    const dashboardRequest = api.get<unknown>("/dashboard-data", {
      params: {
        periode: query.periode,
        bulan: query.bulan,
        tahun: query.year,
      },
    });
    const executiveRequest = api.get<unknown>("/executive-dashboard", {
      params: {
        periode: query.periode,
        bulan: query.bulan,
        tahun: query.year,
        month: query.month,
      },
    });
    const workflowRequest = api.get<unknown>("/monthly-status", {
      params: {
        tahun: query.year,
      },
    });

    const [dashboardResult, executiveRawResult, workflowResult] = await Promise.all([
      safeRequest(dashboardRequest, (data) => normalizeDashboard(data, query.periode)),
      safeRequest(executiveRequest, (data) => data),
      safeRequest(workflowRequest, (data) => normalizeWorkflow(data, query.year)),
    ]);

    const normalizedDashboard = dashboardResult.ok ? dashboardResult.value : null;
    const executiveResult: SafeResult<ExecutiveDashboardData> = executiveRawResult.ok
      ? { ok: true, value: normalizeExecutive(executiveRawResult.value, normalizedDashboard) }
      : executiveRawResult;

    if (requestId !== requestIdRef.current) return;

    setDashboard(dashboardResult.ok
      ? { data: dashboardResult.value, error: null, isLoading: false }
      : { data: null, error: dashboardResult.error, isLoading: false });
    setExecutive(executiveResult.ok
      ? { data: executiveResult.value, error: null, isLoading: false }
      : { data: null, error: executiveResult.error, isLoading: false });
    setWorkflow(workflowResult.ok
      ? { data: workflowResult.value, error: null, isLoading: false }
      : { data: null, error: workflowResult.error, isLoading: false });
  }, [query]);

  useEffect(() => {
    void refetch();

    return () => {
      requestIdRef.current += 1;
    };
  }, [refetch]);

  return {
    dashboard,
    executive,
    workflow,
    query,
    refetch,
  };
}
