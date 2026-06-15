"use client";

import { Tag, Tooltip } from "antd";
import type { AnomalyFlag } from "@/hooks/useFeederData";

type AnomalyBadgeProps = {
  flag: AnomalyFlag;
};

const ANOMALY_META: Record<string, { color: string; label: string; description: string }> = {
  TURUN_DRASTIS: {
    color: "red",
    label: "Turun Drastis",
    description: "Pemakaian turun tajam dibanding periode acuan.",
  },
  STAGNAN: {
    color: "default",
    label: "Stagnan",
    description: "Nilai kWh tidak bergerak signifikan.",
  },
  NOL_PEMAKAIAN: {
    color: "volcano",
    label: "Nol Pemakaian",
    description: "Pemakaian tercatat nol pada periode ini.",
  },
  LONJAKAN: {
    color: "gold",
    label: "Lonjakan",
    description: "Pemakaian naik tajam dibanding periode acuan.",
  },
  POLA_TIDAK_WAJAR: {
    color: "purple",
    label: "Pola Tidak Wajar",
    description: "Pola data membutuhkan pemeriksaan lanjutan.",
  },
  DEVIASI_NORMAL: {
    color: "green",
    label: "Normal",
    description: "Seluruh deviasi berada di bawah 1%.",
  },
  DEVIASI_WARNING: {
    color: "gold",
    label: "Warning",
    description: "Terdapat deviasi antara 1% sampai 3%.",
  },
  DEVIASI_ALERT: {
    color: "red",
    label: "Alert",
    description: "Terdapat deviasi di atas 3%.",
  },
  DATA_TIDAK_LENGKAP: {
    color: "orange",
    label: "Data Belum Lengkap",
    description: "Salah satu sumber meter utama, meter pembanding, atau penyulang belum tersedia.",
  },
};

function fallbackLabel(flag: string) {
  return flag
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function AnomalyBadge({ flag }: AnomalyBadgeProps) {
  const meta = ANOMALY_META[flag] ?? {
    color: "blue",
    label: fallbackLabel(flag),
    description: "Anomali terdeteksi dari backend.",
  };

  return (
    <Tooltip title={meta.description}>
      <Tag color={meta.color}>{meta.label}</Tag>
    </Tooltip>
  );
}
