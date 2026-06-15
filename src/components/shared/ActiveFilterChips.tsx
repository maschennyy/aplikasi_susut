"use client";

import { Button } from "antd";
import { FilterX, X } from "lucide-react";
import styles from "./filter-controls.module.css";

export type ActiveFilterChip = {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
};

type ActiveFilterChipsProps = {
  filters: ActiveFilterChip[];
  resetLabel?: string;
  onResetAll: () => void;
};

export function ActiveFilterChips({ filters, resetLabel = "Reset semua", onResetAll }: ActiveFilterChipsProps) {
  if (filters.length === 0) return null;

  return (
    <div className={styles.activeFilterRow} aria-label="Filter aktif">
      {filters.map((filter) => (
        <button
          key={filter.key}
          aria-label={`Hapus filter ${filter.label}: ${filter.value}`}
          className={styles.filterChip}
          type="button"
          onClick={filter.onClear}
        >
          <X aria-hidden="true" size={12} />
          <span>
            {filter.label}: {filter.value}
          </span>
        </button>
      ))}
      <Button
        className={styles.resetAllButton}
        icon={<FilterX aria-hidden="true" size={14} />}
        size="small"
        type="text"
        onClick={onResetAll}
      >
        {resetLabel}
      </Button>
    </div>
  );
}
