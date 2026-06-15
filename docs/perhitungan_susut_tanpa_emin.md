# Perhitungan Susut Tanpa EMIN

Dokumen ini menjadi acuan aturan bisnis untuk susut bulanan dan kumulatif tanpa EMIN.

## Rumus Dasar

```text
kWh Produksi = kWh Utama + kWh Terima
kWh Terima Netto = kWh Produksi - kWh Kirim
kWh Siap Jual = kWh Terima Netto - PSSD
Susut Tanpa EMIN (kWh) = kWh Siap Jual - kWh Jual + kWh EMIN
Susut Tanpa EMIN (%) = Susut Tanpa EMIN / kWh Produksi × 100%
```

EMIN ditambahkan kembali karena nilai EMIN pada laporan menjadi kompensasi atau pengurang susut. Ketika pengaruh EMIN dikeluarkan, nilainya dikembalikan ke komponen susut.

## Contoh Januari

```text
kWh Utama          = 343.880.003
kWh Terima         =  39.624.065
kWh Produksi       = 383.504.068
kWh Kirim          =  55.319.301
kWh Terima Netto   = 328.184.767
PSSD               =   2.438.439
kWh Siap Jual      = 325.746.328
kWh Jual           = 292.999.963
EMIN               =   4.971.114
Susut tanpa EMIN   =  37.717.479
Persentase susut   =        9,83%
```

## Perhitungan Kumulatif

Perhitungan kumulatif dilakukan dengan menjumlahkan setiap parameter kWh dari Januari sampai bulan yang dipilih, kemudian memasukkan jumlah tersebut ke rumus yang sama.

```text
Produksi kumulatif = Σ kWh Utama + Σ kWh Terima
Terima netto kumulatif = Produksi kumulatif - Σ kWh Kirim
Siap jual kumulatif = Terima netto kumulatif - Σ PSSD
Susut kumulatif tanpa EMIN = Siap jual kumulatif - Σ kWh Jual + Σ EMIN
Susut kumulatif tanpa EMIN (%) = Susut kumulatif / Produksi kumulatif × 100%
```

Persentase bulanan tidak dijumlahkan dan tidak dirata-ratakan.
