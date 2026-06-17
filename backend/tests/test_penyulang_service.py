import unittest
from unittest.mock import patch

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import (
    AuditLog,
    FeederReading,
    GarduInduk,
    MeterReading,
    Penyulang,
    Trafo,
)
from backend.services.audit_log import AuditActor
from backend.services.penyulang import (
    PenyulangServiceError,
    create_penyulang,
    list_penyulangs,
    update_penyulang,
)


class PenyulangServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))

    def setUp(self):
        with app.app_context():
            AuditLog.query.delete()
            FeederReading.query.delete()
            MeterReading.query.delete()
            Penyulang.query.delete()
            Trafo.query.delete()
            GarduInduk.query.delete()
            db.session.commit()
        self.actor = AuditActor(
            user_id=None,
            username="test",
            role="operator",
            ip_address="local",
            user_agent="unit-test",
        )

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def create_gi_trafo(self, kode):
        gi = GarduInduk(kode_gi=kode, nama_gi=f"GI {kode}")
        db.session.add(gi)
        db.session.flush()
        trafo = Trafo(
            gi_id=gi.id,
            kode_trafo=f"T-{kode}",
            nama_trafo=f"Trafo {kode}",
            kapasitas_mva=60,
        )
        db.session.add(trafo)
        db.session.commit()
        return gi, trafo

    def test_create_requires_existing_trafo(self):
        with app.app_context():
            with self.assertRaises(PenyulangServiceError) as context:
                create_penyulang(
                    {
                        "trafo_id": 999,
                        "kode_penyulang": "F1",
                        "nama_penyulang": "Feeder",
                    },
                    self.actor,
                )
            self.assertEqual(context.exception.status_code, 400)
            self.assertEqual(str(context.exception), "Trafo wajib dipilih.")

    def test_invalid_status_is_rejected_for_write_and_filter(self):
        with app.app_context():
            _, trafo = self.create_gi_trafo("A")
            with self.assertRaisesRegex(PenyulangServiceError, "Status penyulang"):
                create_penyulang(
                    {
                        "trafo_id": trafo.id,
                        "kode_penyulang": "F1",
                        "nama_penyulang": "Feeder",
                        "status": "RUSAK",
                    },
                    self.actor,
                )
            with self.assertRaisesRegex(PenyulangServiceError, "Status penyulang"):
                list_penyulangs(status="rusak")

    def test_duplicate_code_is_scoped_to_same_trafo(self):
        with app.app_context():
            gi_a, trafo_a = self.create_gi_trafo("A")
            gi_b, trafo_b = self.create_gi_trafo("B")
            db.session.add(
                Penyulang(
                    gi_id=gi_a.id,
                    trafo_id=trafo_a.id,
                    kode_penyulang="F1",
                    nama_penyulang="Pertama",
                    status="AKTIF",
                    aktif=True,
                )
            )
            db.session.commit()

            with self.assertRaises(PenyulangServiceError) as context:
                create_penyulang(
                    {
                        "trafo_id": trafo_a.id,
                        "kode_penyulang": "f1",
                        "nama_penyulang": "Duplikat",
                    },
                    self.actor,
                )
            self.assertEqual(context.exception.status_code, 409)

            created = create_penyulang(
                {
                    "trafo_id": trafo_b.id,
                    "kode_penyulang": "f1",
                    "nama_penyulang": "Trafo B",
                },
                self.actor,
            )
            self.assertEqual(created["trafo_id"], trafo_b.id)
            self.assertEqual(created["gi_id"], gi_b.id)

    def test_aktif_only_payload_synchronizes_status(self):
        with app.app_context():
            _, trafo = self.create_gi_trafo("A")
            created = create_penyulang(
                {
                    "trafo_id": trafo.id,
                    "kode_penyulang": "F1",
                    "nama_penyulang": "Feeder",
                    "aktif": False,
                },
                self.actor,
            )
            self.assertEqual(created["status"], "NONAKTIF")
            self.assertFalse(created["aktif"])

            updated = update_penyulang(
                created["id"],
                {"aktif": True},
                self.actor,
            )
            self.assertEqual(updated["status"], "AKTIF")
            self.assertTrue(updated["aktif"])

    def test_update_preserves_optional_area_until_explicitly_cleared(self):
        with app.app_context():
            _, trafo = self.create_gi_trafo("A")
            created = create_penyulang(
                {
                    "trafo_id": trafo.id,
                    "kode_penyulang": "F1",
                    "nama_penyulang": "Awal",
                    "area_up3": "UP3 A",
                    "ex_cabang": "EX-A",
                },
                self.actor,
            )

            preserved = update_penyulang(
                created["id"],
                {"nama_penyulang": "Baru"},
                self.actor,
            )
            self.assertEqual(preserved["area_up3"], "UP3 A")
            self.assertEqual(preserved["ex_cabang"], "EX-A")

            cleared = update_penyulang(
                created["id"],
                {"area_up3": "", "ex_cabang": ""},
                self.actor,
            )
            self.assertIsNone(cleared["area_up3"])
            self.assertIsNone(cleared["ex_cabang"])

    def test_update_missing_penyulang_returns_not_found(self):
        with app.app_context():
            with self.assertRaises(PenyulangServiceError) as context:
                update_penyulang(999, {}, self.actor)
            self.assertEqual(context.exception.status_code, 404)

    def test_audit_failure_rolls_back_penyulang(self):
        with app.app_context():
            _, trafo = self.create_gi_trafo("A")
            with patch(
                "backend.services.penyulang.add_audit_log",
                side_effect=RuntimeError("audit gagal"),
            ):
                with self.assertRaisesRegex(RuntimeError, "audit gagal"):
                    create_penyulang(
                        {
                            "trafo_id": trafo.id,
                            "kode_penyulang": "ROLLBACK",
                            "nama_penyulang": "Rollback",
                        },
                        self.actor,
                    )
            self.assertEqual(
                Penyulang.query.filter_by(kode_penyulang="ROLLBACK").count(),
                0,
            )


if __name__ == "__main__":
    unittest.main()
