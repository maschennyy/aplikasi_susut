"""
seed_data.py — Isi data awal untuk testing
Jalankan SEKALI setelah models.py baru diterapkan:
  python seed_data.py

Script ini mengisi:
  - 2 Gardu Induk (TNG, SRP)
  - 2 Trafo per GI
  - 6 Penyulang untuk GI Tangerang Trafo 1
  - Data meter readings Mei 2025
  - Data feeder readings Mei 2025
"""

from app import app, db
from models import (GarduInduk, Trafo, Penyulang,
                    MeterReading, FeederReading, TransferAntarUnit)
from datetime import date

def seed():
    with app.app_context():
        # Hapus data lama jika ada (urutan penting karena ada FK)
        print("Menghapus data lama...")
        FeederReading.query.delete()
        MeterReading.query.delete()
        TransferAntarUnit.query.delete()
        Penyulang.query.delete()
        Trafo.query.delete()
        GarduInduk.query.delete()
        db.session.commit()

        # ── 1. Gardu Induk ──────────────────────────────
        print("Membuat Gardu Induk...")
        gi_tng = GarduInduk(
            kode_gi='TNG', nama_gi='GI Tangerang',
            area='UP3 Tangerang', unit='UID Banten',
            alamat='Jl. Daan Mogot, Tangerang'
        )
        gi_srp = GarduInduk(
            kode_gi='SRP', nama_gi='GI Serpong',
            area='UP3 Tangerang', unit='UID Banten',
            alamat='Jl. Raya Serpong, Tangerang Selatan'
        )
        db.session.add_all([gi_tng, gi_srp])
        db.session.flush()  # dapat id sebelum commit

        # ── 2. Trafo ────────────────────────────────────
        print("Membuat Trafo...")
        t1 = Trafo(gi_id=gi_tng.id, kode_trafo='TNG-T1',
                   nama_trafo='Trafo 1', kapasitas_mva=60, tegangan_kv=150)
        t2 = Trafo(gi_id=gi_tng.id, kode_trafo='TNG-T2',
                   nama_trafo='Trafo 2', kapasitas_mva=60, tegangan_kv=150)
        t3 = Trafo(gi_id=gi_srp.id, kode_trafo='SRP-T1',
                   nama_trafo='Trafo 1', kapasitas_mva=60, tegangan_kv=150)
        db.session.add_all([t1, t2, t3])
        db.session.flush()

        # ── 3. Penyulang (6 untuk TNG-T1) ───────────────
        print("Membuat Penyulang...")
        feeders_data = [
            ('TNG-01', 'Batuceper'),
            ('TNG-02', 'Karawaci'),
            ('TNG-03', 'Tanah Tinggi'),
            ('TNG-04', 'Pinang'),
            ('TNG-05', 'Neglasari'),
            ('TNG-06', 'Cipondoh'),
        ]
        feeders = []
        for kode, nama in feeders_data:
            f = Penyulang(trafo_id=t1.id, gi_id=gi_tng.id,
                          kode_penyulang=kode, nama_penyulang=nama)
            feeders.append(f)
        db.session.add_all(feeders)
        db.session.flush()

        # ── 4. Meter Reading — TNG Trafo 1, Mei 2025 ────
        print("Membuat MeterReading...")
        mr = MeterReading(
            trafo_id=t1.id, gi_id=gi_tng.id,
            periode_bulan=date(2025, 5, 1),
            # Meter Utama
            mu_stand_awal=10000000, mu_stand_akhir=10047801, mu_faktor_kali=80,
            mu_kwh_wbp=22840, mu_kwh_lwbp1=9624, mu_kwh_lwbp2=5537,
            # Meter Pembanding
            mp_stand_awal=9900000, mp_stand_akhir=9947212, mp_faktor_kali=80,
            mp_kwh_wbp=22591, mp_kwh_lwbp1=9512, mp_kwh_lwbp2=5477,
        )
        db.session.add(mr)

        # ── 5. Feeder Readings — 6 penyulang, Mei 2025 ──
        print("Membuat FeederReading...")
        fr_data = [
            # (penyulang_obj, stand_awal, stand_akhir, wbp, lwbp1, lwbp2)
            (feeders[0], 8421300,  8603200,  8712, 3214, 2614),
            (feeders[1], 12301500, 12534800, 11218, 4212, 3254),
            (feeders[2], 6782100,  6954900,  9014, 3214, 1604),
            (feeders[3], 9150400,  9318700,  8312, 2814, 2300),
            (feeders[4], 7643200,  7798500,  7624, 2614, 2162),
            (feeders[5], 5210800,  5389100,  10124, 2814, 1314),
        ]
        for py, sa, sak, wbp, lw1, lw2 in fr_data:
            db.session.add(FeederReading(
                penyulang_id=py.id, trafo_id=t1.id, gi_id=gi_tng.id,
                periode_bulan=date(2025, 5, 1),
                stand_awal=sa, stand_akhir=sak, faktor_kali=80,
                kwh_wbp=wbp, kwh_lwbp1=lw1, kwh_lwbp2=lw2
            ))

        # ── 6. Transfer Antar Unit, Mei 2025 ────────────
        print("Membuat TransferAntarUnit...")
        transfers = [
            TransferAntarUnit(periode_bulan=date(2025,5,1),
                unit_asal='UP3 Tangerang', unit_tujuan='UP3 Jakarta Barat',
                gi_interkoneksi='GI Serpong', kode_interbus='TNG-JKB-01',
                kwh_transfer=6218000, arah='EKSPOR'),
            TransferAntarUnit(periode_bulan=date(2025,5,1),
                unit_asal='UP3 Jawa Barat', unit_tujuan='UP3 Tangerang',
                gi_interkoneksi='GI Cikupa', kode_interbus='JBR-TNG-01',
                kwh_transfer=5124000, arah='IMPOR'),
        ]
        db.session.add_all(transfers)

        db.session.commit()
        print("\n✓ Seed data berhasil dibuat!")
        print(f"  GarduInduk : 2 data")
        print(f"  Trafo      : 3 data")
        print(f"  Penyulang  : 6 data")
        print(f"  MeterReading  : 1 data (Mei 2025)")
        print(f"  FeederReading : 6 data (Mei 2025)")
        print(f"  Transfer      : 2 data (Mei 2025)")

if __name__ == '__main__':
    seed()