# Skema Pengembangan Transfer EXIM

## Tujuan
Menu Transfer EXIM perlu mendukung dua konsep perhitungan tanpa mengunci aplikasi pada satu rumus. Semua perhitungan sebaiknya berbasis `rule`, sehingga perubahan metode cukup mengubah konfigurasi rule dan bukan membongkar modul.

## Konsep 1: Proporsi KVA Gardu

Dipakai saat satu penyulang memasok gardu di dua atau lebih UP3, tetapi belum ada instrumen pengukuran per gardu.

Rumus dasar:

```text
porsi_up3 = total_kva_up3 / total_kva_seluruh_up3_pada_rule
kwh_up3 = porsi_up3 * kwh_total_penyulang
```

Data minimum:

```text
rule_exim
- kode_rule
- metode = KVA_GARDU
- penyulang_id
- up3_asal
- periode_mulai
- periode_selesai
- aktif

rule_exim_partisipan
- rule_id
- nama_gardu
- up3
- kva_trafo
- porsi_override
- catatan
```

Catatan fleksibilitas:

- `porsi_override` disiapkan jika porsi tidak murni dari KVA.
- `periode_mulai` dan `periode_selesai` membuat perubahan konfigurasi bisa historis.
- Satu rule bisa punya banyak gardu dan banyak UP3.

## Konsep 2: Tagihan kWh Jual Pelanggan

Dipakai saat penyulang milik UP3 B menyuplai pelanggan milik UP3 A. Nilai transfer mengikuti kWh jual pelanggan.

Rumus dasar:

```text
kwh_transfer = total_kwh_jual_pelanggan_lintas_up3
```

Data minimum:

```text
rule_exim
- kode_rule
- metode = KWH_JUAL
- penyulang_id
- up3_asal
- up3_tujuan
- periode_mulai
- periode_selesai
- aktif

rule_exim_pelanggan
- rule_id
- id_pelanggan
- nama_pelanggan
- up3_pelanggan
- kwh_jual
- periode_bulan
- catatan
```

Catatan fleksibilitas:

- kWh jual pelanggan bisa diupload bulanan.
- Jika nanti tersedia data tarif/rupiah, tabel pelanggan bisa ditambah `tarif`, `rp_jual`, dan `daya`.
- Rule tetap melekat ke penyulang agar arah ekspor/impor mudah ditelusuri.

## Hasil Bulanan

Semua metode harus menghasilkan bentuk hasil yang sama.

```text
hasil_transfer_exim
- periode_bulan
- rule_id
- metode
- penyulang_id
- up3_asal
- up3_tujuan
- kwh_basis
- kwh_transfer
- porsi
- arah = EKSPOR / IMPOR
- versi_hitung
- catatan
```

Manfaat:

- Rekap EXIM tidak perlu tahu detail rumus.
- Audit mudah karena hasil bulanan tersimpan sebagai snapshot.
- Jika rumus berubah, hasil lama tetap dapat dipertahankan.

## Urutan Implementasi

1. Tambah tabel rule dan hasil EXIM.
2. Tambah upload master KVA gardu.
3. Tambah upload kWh jual pelanggan lintas UP3.
4. Buat engine hitung bulanan berdasarkan metode rule.
5. Tampilkan rekap ekspor/impor per UP3, GI, penyulang, dan periode.

## Prinsip Desain

- Satu penyulang boleh memiliki banyak rule.
- Rule harus memiliki periode berlaku.
- Hasil hitung bulanan tidak langsung menimpa data sumber.
- Manual override harus tercatat sebagai catatan, bukan mengubah data mentah.
