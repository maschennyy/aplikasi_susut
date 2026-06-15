"""Isi data contoh hanya untuk database development lokal.

Jalankan setelah migrasi database selesai:

    npm run backend:db:upgrade
    npm run backend:seed

Perintah ini bersifat destruktif dan dilindungi oleh pemeriksaan environment,
target database lokal, serta konfirmasi eksplisit.
"""

from __future__ import annotations

import argparse
import os
from datetime import date

from sqlalchemy import inspect

from .entrypoint import app
from .models import (
    db,
    EximCustomerCharge,
    EximKvaParticipant,
    EximMonthlyResult,
    EximRule,
    FeederReading,
    GarduInduk,
    KwhJual,
    MeterReading,
    Penyulang,
    RekapBulanan,
    Trafo,
    TransferAntarUnit,
)
from .seed_safety import (
    SeedSafetyError,
    SeedTarget,
    require_seed_confirmation,
    validate_seed_target,
)


REQUIRED_TABLES = {
    "gardu_induk",
    "trafo",
    "penyulang",
    "meter_reading",
    "feeder_reading",
    "transfer_antar_unit",
}


def _ensure_schema_is_ready() -> None:
    table_names = set(inspect(db.engine).get_table_names())
    missing = sorted(REQUIRED_TABLES - table_names)
    if missing:
        raise RuntimeError(
            "Skema database belum siap. Tabel tidak ditemukan: "
            f"{', '.join(missing)}. Jalankan npm run backend:db:upgrade terlebih dahulu."
        )


def _clear_seed_scope() -> None:
    """Delete records in foreign-key-safe order within the active transaction."""
    delete_order = (
        EximMonthlyResult,
        EximCustomerCharge,
        EximKvaParticipant,
        EximRule,
        KwhJual,
        RekapBulanan,
        FeederReading,
        MeterReading,
        TransferAntarUnit,
        Penyulang,
        Trafo,
        GarduInduk,
    )
    for model in delete_order:
        model.query.delete(synchronize_session=False)


def seed(*, confirmed_target: SeedTarget) -> None:
    if not isinstance(confirmed_target, SeedTarget):
        raise SeedSafetyError(
            "Seed harus melewati pemeriksaan target dan konfirmasi keselamatan."
        )

    with app.app_context():
        _ensure_schema_is_ready()

        try:
            print(f"Mereset data development pada {confirmed_target.display_url}...")
            _clear_seed_scope()

            print("Membuat Gardu Induk...")
            gi_tng = GarduInduk(
                kode_gi="TNG",
                nama_gi="GI Tangerang",
                area="UP3 Tangerang",
                unit="UID Banten",
                alamat="Jl. Daan Mogot, Tangerang",
            )
            gi_srp = GarduInduk(
                kode_gi="SRP",
                nama_gi="GI Serpong",
                area="UP3 Tangerang",
                unit="UID Banten",
                alamat="Jl. Raya Serpong, Tangerang Selatan",
            )
            db.session.add_all([gi_tng, gi_srp])
            db.session.flush()

            print("Membuat Trafo...")
            t1 = Trafo(
                gi_id=gi_tng.id,
                kode_trafo="TNG-T1",
                nama_trafo="Trafo 1",
                kapasitas_mva=60,
                tegangan_kv=150,
            )
            t2 = Trafo(
                gi_id=gi_tng.id,
                kode_trafo="TNG-T2",
                nama_trafo="Trafo 2",
                kapasitas_mva=60,
                tegangan_kv=150,
            )
            t3 = Trafo(
                gi_id=gi_srp.id,
                kode_trafo="SRP-T1",
                nama_trafo="Trafo 1",
                kapasitas_mva=60,
                tegangan_kv=150,
            )
            db.session.add_all([t1, t2, t3])
            db.session.flush()

            print("Membuat Penyulang...")
            feeders = [
                Penyulang(
                    trafo_id=t1.id,
                    gi_id=gi_tng.id,
                    kode_penyulang=kode,
                    nama_penyulang=nama,
                )
                for kode, nama in (
                    ("TNG-01", "Batuceper"),
                    ("TNG-02", "Karawaci"),
                    ("TNG-03", "Tanah Tinggi"),
                    ("TNG-04", "Pinang"),
                    ("TNG-05", "Neglasari"),
                    ("TNG-06", "Cipondoh"),
                )
            ]
            db.session.add_all(feeders)
            db.session.flush()

            print("Membuat MeterReading...")
            db.session.add(
                MeterReading(
                    trafo_id=t1.id,
                    gi_id=gi_tng.id,
                    periode_bulan=date(2025, 5, 1),
                    mu_stand_awal=10000000,
                    mu_stand_akhir=10047801,
                    mu_faktor_kali=80,
                    mu_kwh_wbp=22840,
                    mu_kwh_lwbp1=9624,
                    mu_kwh_lwbp2=5537,
                    mp_stand_awal=9900000,
                    mp_stand_akhir=9947212,
                    mp_faktor_kali=80,
                    mp_kwh_wbp=22591,
                    mp_kwh_lwbp1=9512,
                    mp_kwh_lwbp2=5477,
                )
            )

            print("Membuat FeederReading...")
            feeder_readings = (
                (feeders[0], 8421300, 8603200, 8712, 3214, 2614),
                (feeders[1], 12301500, 12534800, 11218, 4212, 3254),
                (feeders[2], 6782100, 6954900, 9014, 3214, 1604),
                (feeders[3], 9150400, 9318700, 8312, 2814, 2300),
                (feeders[4], 7643200, 7798500, 7624, 2614, 2162),
                (feeders[5], 5210800, 5389100, 10124, 2814, 1314),
            )
            for feeder, stand_awal, stand_akhir, wbp, lwbp1, lwbp2 in feeder_readings:
                db.session.add(
                    FeederReading(
                        penyulang_id=feeder.id,
                        trafo_id=t1.id,
                        gi_id=gi_tng.id,
                        periode_bulan=date(2025, 5, 1),
                        stand_awal=stand_awal,
                        stand_akhir=stand_akhir,
                        faktor_kali=80,
                        kwh_wbp=wbp,
                        kwh_lwbp1=lwbp1,
                        kwh_lwbp2=lwbp2,
                    )
                )

            print("Membuat TransferAntarUnit...")
            db.session.add_all(
                [
                    TransferAntarUnit(
                        periode_bulan=date(2025, 5, 1),
                        unit_asal="UP3 Tangerang",
                        unit_tujuan="UP3 Jakarta Barat",
                        gi_interkoneksi="GI Serpong",
                        kode_interbus="TNG-JKB-01",
                        kwh_transfer=6218000,
                        arah="EKSPOR",
                    ),
                    TransferAntarUnit(
                        periode_bulan=date(2025, 5, 1),
                        unit_asal="UP3 Jawa Barat",
                        unit_tujuan="UP3 Tangerang",
                        gi_interkoneksi="GI Cikupa",
                        kode_interbus="JBR-TNG-01",
                        kwh_transfer=5124000,
                        arah="IMPOR",
                    ),
                ]
            )

            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        print("\n✓ Seed development berhasil dibuat!")
        print("  GarduInduk    : 2 data")
        print("  Trafo         : 3 data")
        print("  Penyulang     : 6 data")
        print("  MeterReading  : 1 data (Mei 2025)")
        print("  FeederReading : 6 data (Mei 2025)")
        print("  Transfer      : 2 data (Mei 2025)")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reset database development lokal dan isi data contoh.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help=(
            "Lewati prompt interaktif. Tetap membutuhkan "
            "SEED_CONFIRMATION=RESET_LOCAL_DEVELOPMENT_DATABASE."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()

    try:
        target = validate_seed_target(
            app_env=app.config.get("APP_ENV"),
            database_url=str(app.config.get("SQLALCHEMY_DATABASE_URI") or ""),
            allow_destructive_seed=os.getenv("ALLOW_DESTRUCTIVE_SEED"),
        )
        require_seed_confirmation(
            target=target,
            assume_yes=args.yes,
            automation_token=os.getenv("SEED_CONFIRMATION"),
        )
        seed(confirmed_target=target)
    except (SeedSafetyError, RuntimeError) as exc:
        print(f"\nSeed dibatalkan: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
