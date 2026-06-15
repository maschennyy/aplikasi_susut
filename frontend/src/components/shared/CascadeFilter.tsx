"use client";

import { Select, Space } from "antd";
import type { GarduIndukOption, PenyulangOption, TrafoOption } from "@/hooks/useFeederData";

type CascadeFilterProps = {
  garduInduk: GarduIndukOption[];
  trafo: TrafoOption[];
  penyulang?: PenyulangOption[];
  giId: number | null;
  trafoId: number | null;
  penyulangId?: number | null;
  loading?: boolean;
  disabled?: boolean;
  showPenyulang?: boolean;
  onChange: (value: { giId: number | null; trafoId: number | null; penyulangId?: number | null }) => void;
};

function matchOption(input: string, option?: { label?: string }) {
  return (option?.label ?? "").toLowerCase().includes(input.toLowerCase());
}

export function CascadeFilter({
  garduInduk,
  trafo,
  penyulang = [],
  giId,
  trafoId,
  penyulangId = null,
  loading = false,
  disabled = false,
  showPenyulang = false,
  onChange,
}: CascadeFilterProps) {
  return (
    <Space wrap size={10}>
      <Select
        allowClear
        disabled={disabled}
        filterOption={matchOption}
        loading={loading}
        optionFilterProp="label"
        options={garduInduk.map((gi) => ({
          label: `${gi.kode} - ${gi.nama}`,
          value: gi.id,
        }))}
        placeholder="Semua Gardu Induk"
        showSearch
        style={{ minWidth: 250 }}
        value={giId ?? undefined}
        onChange={(value) => {
          onChange({
            giId: value ?? null,
            trafoId: null,
            penyulangId: null,
          });
        }}
      />

      <Select
        allowClear
        disabled={disabled || !giId}
        filterOption={matchOption}
        loading={loading}
        optionFilterProp="label"
        options={trafo.map((item) => ({
          label: `${item.kode} - ${item.nama}`,
          value: item.id,
        }))}
        placeholder="Semua Trafo"
        showSearch
        style={{ minWidth: 220 }}
        value={trafoId ?? undefined}
        onChange={(value) => {
          onChange({
            giId,
            trafoId: value ?? null,
            penyulangId: null,
          });
        }}
      />

      {showPenyulang ? (
        <Select
          allowClear
          disabled={disabled || !trafoId}
          filterOption={matchOption}
          loading={loading}
          optionFilterProp="label"
          options={penyulang.map((item) => ({
            label: `${item.kode} - ${item.nama}`,
            value: item.id,
          }))}
          placeholder="Semua Penyulang"
          showSearch
          style={{ minWidth: 240 }}
          value={penyulangId ?? undefined}
          onChange={(value) => {
            onChange({
              giId,
              trafoId,
              penyulangId: value ?? null,
            });
          }}
        />
      ) : null}
    </Space>
  );
}
