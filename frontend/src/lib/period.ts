import dayjs from "dayjs";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function formatPeriodLabel(period: string) {
  const parsed = dayjs(period, "YYYYMM");
  if (!parsed.isValid()) return period;

  return `${MONTH_NAMES[parsed.month()]} ${parsed.year()}`;
}

export function previousPeriod(period: string) {
  const parsed = dayjs(period, "YYYYMM");
  return (parsed.isValid() ? parsed : dayjs()).subtract(1, "month").format("YYYYMM");
}
