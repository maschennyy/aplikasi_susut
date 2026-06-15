# Analisa Workbook NKWh

Workbook acuan: `NkWh§ 042026 - KD.xlsx`

## Struktur Sheet

- `Informasi`: catatan proses input. Data penyulang diisi manual, EXIM umumnya dari AMR, RJKB dari neraca energi/intranet.
- `kWh Penyulang`: sumber utama pemakaian penyulang. Tiap penyulang dibaca sebagai register `H`, `L1`, dan `L2`.
- `TNG`: rekap area per gardu induk, termasuk Meter Utama, Meter Pembanding, Pemakaian Sendiri GI, Keluar GI, Penyulang GI, area/posko, EXIM, dan proporsional.
- `MU MP TRF`: perbandingan Meter Utama, Meter Pembanding, dan total penyulang per trafo GI.
- `DEVIASI`: deviasi total per GI dan deviasi per trafo.
- `Exim`: perhitungan transfer antar unit dengan beberapa metode.
- `RJKB`: data incoming dari P3B/RJKB, beban koinsiden, KVARH, dan meter PS GI.
- `Rekap kWh`: rekap bulanan area.
- `BANTEN - DKI`, `DKI - BANTEN`, `BANTEN - JABAR`: rekap transfer antar UID.

## Pola `kWh Penyulang`

Kolom inti:

```text
A Gardu Induk
B Nama Penyulang
C Trafo
D Faktor Kali
E Stand Awal
F Stand Akhir
G kWh meter = ROUND((akhir - awal) * faktor, 0)
H kWh manual/split
```

Register yang ditemukan:

- `H` atau `WBP` menjadi `kwh_wbp`
- `L1` atau `LWBP1/LWBP` menjadi `kwh_lwbp1`
- `L2` atau `LWBP2` menjadi `kwh_lwbp2`

Nilai kWh yang dipakai aplikasi adalah total:

```text
kwh_total = WBP + LWBP1 + LWBP2
```

Jika kolom manual tersedia, aplikasi memakai nilai manual sebagai nilai register tampilan dan audit. Nilai stand asli tetap disimpan per register.

## Pola `TNG` dan Proporsional

Setiap blok GI berisi bagian:

- Meter Utama
- Meter Pembanding
- Pemakaian Sendiri GI
- Keluar GI
- Penyulang GI
- Area/posko penerima
- EXIM

Proporsional di workbook membagi `Keluar GI` ke penyulang berdasarkan porsi kWh feeder:

```text
prop_wbp   = feeder_wbp   / total_feeder_wbp   * keluar_gi_wbp
prop_lwbp1 = feeder_lwbp1 / total_feeder_lwbp1 * keluar_gi_lwbp1
prop_lwbp2 = feeder_lwbp2 / total_feeder_lwbp2 * keluar_gi_lwbp2
prop_total = prop_wbp + prop_lwbp1 + prop_lwbp2
```

Artinya halaman proporsional perlu mempertahankan grouping per GI, trafo, area/UP3, dan posko.

## Pola Deviasi

Sheet `MU MP TRF` dan `DEVIASI` membandingkan:

```text
MU vs MP        = (MU - MP) / MU
MU vs Penyulang = (MU - Penyulang) / MU
MP vs Penyulang = (MP - Penyulang) / MP
```

Deviasi harus bisa dilihat level GI total dan level trafo.

## Pola `Exim`

Metode yang muncul:

- `DIRECT_STAND`: nilai transfer dari stand awal/akhir EXIM.
- `KVA_PROPORSI`: penyulang memasok beberapa UP3, nilai dibagi memakai porsi KVA trafo/gardu.
- `KWH_JUAL`: nilai transfer mengikuti kWh jual pelanggan lintas UP3.
- `ADJUSTMENT`: koreksi/override manual yang tetap perlu jejak catatan.

Kolom penting:

```text
GI, feeder, lokasi, jenis, area asal, fungsi, area tujuan,
faktor meter, faktor kali,
stand WBP/LWBP1/LWBP2,
kWh manual WBP/LWBP1/LWBP2/total,
KVA pemilik/penerima/total,
kWh penyulang basis
```

## Implementasi Saat Ini

- `nkwh_excel.py` membaca workbook NKWh, menghitung ringkasan sheet, parsing penyulang, parsing blok GI `TNG`, dan mendeteksi metode EXIM.
- `FeederReading` menyimpan stand per register, nilai manual per register, source sheet, dan source row.
- `EximRule` dan `EximMonthlyResult` disiapkan sebagai fondasi rule EXIM bulanan.
- Halaman `Upload NKWh` bisa menganalisa workbook dan mengimport data penyulang serta snapshot EXIM dasar.

## Catatan Lanjutan

- Mapping area/UP3 per penyulang dari sheet `TNG` perlu diperdalam agar area/posko langsung terisi otomatis.
- Import Meter Utama/Meter Pembanding dari `RJKB` dan `TNG` perlu tahap terpisah karena struktur formula merujuk lintas sheet.
- Rule EXIM KVA sebaiknya dilengkapi tabel partisipan saat sudah ada master gardu/trafo per UP3.
