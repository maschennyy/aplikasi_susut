const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

const ROUNDED_NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

const PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
  notation: "compact",
});

export function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

export function formatRoundedNumber(value: number) {
  return ROUNDED_NUMBER_FORMATTER.format(Math.round(value));
}

export function formatCompactNumber(value: number) {
  return COMPACT_NUMBER_FORMATTER.format(value);
}

export function formatKwh(value: number) {
  return formatNumber(value);
}

export function formatPercent(value: number | null) {
  return value === null ? "-" : `${PERCENT_FORMATTER.format(value)}%`;
}

export function formatRawValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return String(value);
}
