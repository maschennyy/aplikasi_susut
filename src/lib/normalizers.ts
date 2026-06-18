export type UnknownRecord = Record<string, unknown>;

const INDONESIAN_GROUP_SEPARATOR = ".";
const INDONESIAN_DECIMAL_SEPARATOR = ",";

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

export function asArray(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function groupedByThousands(parts: string[]) {
  if (parts.length <= 1) return false;
  return parts.slice(1).every((part) => /^\d{3}$/.test(part));
}

function normalizeNumericString(value: string) {
  const cleaned = value
    .trim()
    .replace(/[\s\u00a0]/g, "")
    .replace(/[^\d.,()+-]/g, "");

  if (!cleaned) return "";

  const negative = cleaned.startsWith("-") || (cleaned.startsWith("(") && cleaned.endsWith(")"));
  const unsigned = cleaned.replace(/[()+-]/g, "");
  if (!unsigned) return "";

  const lastDot = unsigned.lastIndexOf(".");
  const lastComma = unsigned.lastIndexOf(",");

  let normalized = unsigned;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastComma > lastDot ? INDONESIAN_DECIMAL_SEPARATOR : INDONESIAN_GROUP_SEPARATOR;
    const groupSeparator = decimalSeparator === INDONESIAN_DECIMAL_SEPARATOR
      ? INDONESIAN_GROUP_SEPARATOR
      : INDONESIAN_DECIMAL_SEPARATOR;

    normalized = unsigned
      .replaceAll(groupSeparator, "")
      .replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    const parts = unsigned.split(",");
    normalized = groupedByThousands(parts)
      ? parts.join("")
      : `${parts.slice(0, -1).join("")}.${parts.at(-1) ?? ""}`;
  } else if (lastDot >= 0) {
    const parts = unsigned.split(".");
    normalized = groupedByThousands(parts)
      ? parts.join("")
      : unsigned;
  }

  return `${negative ? "-" : ""}${normalized}`;
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "string") return fallback;

  const parsed = Number(normalizeNumericString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

export function firstNumber(record: UnknownRecord, keys: readonly string[], fallback = 0): number {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return toNumber(value, fallback);
    }
  }
  return fallback;
}

export function firstString(record: UnknownRecord, keys: readonly string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "bigint") return String(value);
  }
  return fallback;
}

export function firstBoolean(record: UnknownRecord, keys: readonly string[], fallback = true): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "ya", "on", "aktif", "active"].includes(normalized)) return true;
      if (["false", "0", "no", "tidak", "off", "nonaktif", "inactive"].includes(normalized)) return false;
    }
  }
  return fallback;
}

export function periodFromValue(value: unknown, fallbackPeriod: string): string {
  if (typeof value === "string" && /^\d{6}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) {
    return value.slice(0, 7);
  }
  if (/^\d{6}$/.test(fallbackPeriod)) {
    return `${fallbackPeriod.slice(0, 4)}-${fallbackPeriod.slice(4, 6)}`;
  }
  if (/^\d{4}-\d{2}/.test(fallbackPeriod)) {
    return fallbackPeriod.slice(0, 7);
  }
  return fallbackPeriod;
}
