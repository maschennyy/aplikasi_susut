export const DEVIATION_THRESHOLDS = {
  normalMaxExclusive: 1,
  warningMaxInclusive: 3,
} as const;

export type DeviationSeverity = "normal" | "warning" | "alert";

export type DeviationValue = {
  kwh: number;
  percent: number | null;
  severity: DeviationSeverity;
};

export type DeviasiMasterGi = {
  id: number;
  kode: string;
  nama: string;
};

export type DeviasiMasterTrafo = {
  id: number;
  giId: number;
  kode: string;
  nama: string;
};

export type DeviasiMeterSource = {
  trafoId: number;
  giId: number | null;
  periode: string;
  kwh: number;
};

export type DeviasiFeederSource = {
  trafoId: number;
  giId: number | null;
  periode: string;
  kwh: number;
};

export type DeviasiStatusFlag =
  | "DEVIASI_NORMAL"
  | "DEVIASI_WARNING"
  | "DEVIASI_ALERT"
  | "DATA_TIDAK_LENGKAP";

export type DeviasiRow = {
  key: string;
  giId: number | null;
  giKode: string;
  giNama: string;
  trafoId: number;
  trafoKode: string;
  trafoNama: string;
  periode: string;
  kwhMeterUtama: number;
  kwhMeterPembanding: number;
  kwhPenyulang: number;
  deviasiUtamaPembanding: DeviationValue;
  deviasiPembandingFeeder: DeviationValue;
  status: DeviationSeverity;
  statusFlag: DeviasiStatusFlag;
  missingSources: string[];
};

export type DeviasiSummary = {
  totalRows: number;
  totalMeterUtama: number;
  totalMeterPembanding: number;
  totalPenyulang: number;
  deviasiUtamaPembanding: DeviationValue;
  deviasiPembandingFeeder: DeviationValue;
  normalCount: number;
  warningCount: number;
  alertCount: number;
  incompleteCount: number;
};

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function classifyDeviation(percent: number | null): DeviationSeverity {
  if (percent === null || !Number.isFinite(percent)) return "alert";

  const absolute = Math.abs(percent);
  if (absolute > DEVIATION_THRESHOLDS.warningMaxInclusive) return "alert";
  if (absolute >= DEVIATION_THRESHOLDS.normalMaxExclusive) return "warning";
  return "normal";
}

export function calculateDeviation(reference: number, comparison: number): DeviationValue {
  const safeReference = finiteNumber(reference);
  const safeComparison = finiteNumber(comparison);
  const kwh = safeReference - safeComparison;
  const percent = safeReference === 0 ? (safeComparison === 0 ? 0 : null) : (kwh / safeReference) * 100;

  return {
    kwh,
    percent,
    severity: classifyDeviation(percent),
  };
}

function groupEnergyByTrafo<T extends DeviasiMeterSource | DeviasiFeederSource>(rows: T[]) {
  const grouped = new Map<number, { giId: number | null; periode: string; kwh: number }>();

  for (const row of rows) {
    if (!Number.isFinite(row.trafoId) || row.trafoId <= 0) continue;
    const current = grouped.get(row.trafoId);
    grouped.set(row.trafoId, {
      giId: current?.giId ?? row.giId,
      periode: current?.periode || row.periode,
      kwh: (current?.kwh ?? 0) + finiteNumber(row.kwh),
    });
  }

  return grouped;
}

function highestSeverity(...severities: DeviationSeverity[]): DeviationSeverity {
  if (severities.includes("alert")) return "alert";
  if (severities.includes("warning")) return "warning";
  return "normal";
}

function statusFlag(status: DeviationSeverity, incomplete: boolean): DeviasiStatusFlag {
  if (incomplete) return "DATA_TIDAK_LENGKAP";
  if (status === "alert") return "DEVIASI_ALERT";
  if (status === "warning") return "DEVIASI_WARNING";
  return "DEVIASI_NORMAL";
}

export function buildDeviasiRows(input: {
  garduInduk: DeviasiMasterGi[];
  trafo: DeviasiMasterTrafo[];
  meterUtama: DeviasiMeterSource[];
  meterPembanding: DeviasiMeterSource[];
  feeder: DeviasiFeederSource[];
  periode: string;
}): DeviasiRow[] {
  const giById = new Map(input.garduInduk.map((gi) => [gi.id, gi]));
  const trafoById = new Map(input.trafo.map((trafo) => [trafo.id, trafo]));
  const utamaByTrafo = groupEnergyByTrafo(input.meterUtama);
  const pembandingByTrafo = groupEnergyByTrafo(input.meterPembanding);
  const feederByTrafo = groupEnergyByTrafo(input.feeder);
  const trafoIds = new Set<number>([
    ...utamaByTrafo.keys(),
    ...pembandingByTrafo.keys(),
    ...feederByTrafo.keys(),
  ]);

  return Array.from(trafoIds)
    .map((trafoId): DeviasiRow => {
      const utama = utamaByTrafo.get(trafoId);
      const pembanding = pembandingByTrafo.get(trafoId);
      const feeder = feederByTrafo.get(trafoId);
      const trafo = trafoById.get(trafoId);
      const giId = trafo?.giId ?? utama?.giId ?? pembanding?.giId ?? feeder?.giId ?? null;
      const gi = giId ? giById.get(giId) : undefined;
      const missingSources: string[] = [];

      if (!utama) missingSources.push("Meter Utama");
      if (!pembanding) missingSources.push("Meter Pembanding");
      if (!feeder) missingSources.push("Penyulang");

      const kwhMeterUtama = utama?.kwh ?? 0;
      const kwhMeterPembanding = pembanding?.kwh ?? 0;
      const kwhPenyulang = feeder?.kwh ?? 0;
      const deviasiUtamaPembanding = calculateDeviation(kwhMeterUtama, kwhMeterPembanding);
      const deviasiPembandingFeeder = calculateDeviation(kwhMeterPembanding, kwhPenyulang);
      const status = highestSeverity(
        deviasiUtamaPembanding.severity,
        deviasiPembandingFeeder.severity,
        missingSources.length > 0 ? "alert" : "normal",
      );

      return {
        key: `${trafoId}-${utama?.periode ?? pembanding?.periode ?? feeder?.periode ?? input.periode}`,
        giId,
        giKode: gi?.kode ?? "-",
        giNama: gi?.nama ?? "GI belum dipetakan",
        trafoId,
        trafoKode: trafo?.kode ?? "-",
        trafoNama: trafo?.nama ?? `Trafo #${trafoId}`,
        periode: utama?.periode ?? pembanding?.periode ?? feeder?.periode ?? input.periode,
        kwhMeterUtama,
        kwhMeterPembanding,
        kwhPenyulang,
        deviasiUtamaPembanding,
        deviasiPembandingFeeder,
        status,
        statusFlag: statusFlag(status, missingSources.length > 0),
        missingSources,
      };
    })
    .sort((a, b) => {
      const giCompare = a.giNama.localeCompare(b.giNama, "id");
      if (giCompare !== 0) return giCompare;
      return a.trafoKode.localeCompare(b.trafoKode, "id", { numeric: true });
    });
}

export function summarizeDeviasi(rows: DeviasiRow[]): DeviasiSummary {
  const totalMeterUtama = rows.reduce((total, row) => total + row.kwhMeterUtama, 0);
  const totalMeterPembanding = rows.reduce((total, row) => total + row.kwhMeterPembanding, 0);
  const totalPenyulang = rows.reduce((total, row) => total + row.kwhPenyulang, 0);

  return {
    totalRows: rows.length,
    totalMeterUtama,
    totalMeterPembanding,
    totalPenyulang,
    deviasiUtamaPembanding: calculateDeviation(totalMeterUtama, totalMeterPembanding),
    deviasiPembandingFeeder: calculateDeviation(totalMeterPembanding, totalPenyulang),
    normalCount: rows.filter((row) => row.status === "normal" && row.missingSources.length === 0).length,
    warningCount: rows.filter((row) => row.status === "warning" && row.missingSources.length === 0).length,
    alertCount: rows.filter((row) => row.status === "alert" && row.missingSources.length === 0).length,
    incompleteCount: rows.filter((row) => row.missingSources.length > 0).length,
  };
}
