import unittest
from unittest.mock import patch

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import AuditLog, GarduInduk, Trafo
from backend.services.audit_log import AuditActor
from backend.services.trafo import (
    TrafoServiceError,
    create_trafo,
    update_trafo,
)


class TrafoServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))

    def setUp(self):
        with app.app_context():
            AuditLog.query.delete()
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

    def create_gi(self, kode="GI"):
        gi = GarduInduk(kode_gi=kode, nama_gi=f"GI {kode}")
        db.session.add(gi)
        db.session.commit()
        return gi

    def test_create_requires_existing_gardu_induk(self):
        with app.app_context():
            with self.assertRaises(TrafoServiceError) as context:
                create_trafo(
                    {"gi_id": 999, "kode_trafo": "T1", "nama_trafo": "Trafo"},
                    self.actor,
                )
            self.assertEqual(context.exception.status_code, 400)
            self.assertEqual(str(context.exception), "Gardu induk wajib dipilih.")

    def test_invalid_and_negative_numeric_values_are_rejected(self):
        with app.app_context():
            gi = self.create_gi()
            with self.assertRaisesRegex(TrafoServiceError, "Kapasitas MVA"):
                create_trafo(
                    {
                        "gi_id": gi.id,
                        "kode_trafo": "BAD",
                        "nama_trafo": "Invalid",
                        "kapasitas_mva": "NaN",
                    },
                    self.actor,
                )
            with self.assertRaisesRegex(TrafoServiceError, "Tegangan kV tidak boleh negatif"):
                create_trafo(
                    {
                        "gi_id": gi.id,
                        "kode_trafo": "NEG",
                        "nama_trafo": "Negatif",
                        "tegangan_kv": "-20",
                    },
                    self.actor,
                )

    def test_duplicate_code_is_scoped_to_same_gi(self):
        with app.app_context():
            gi_a = self.create_gi("A")
            gi_b = self.create_gi("B")
            db.session.add(
                Trafo(
                    gi_id=gi_a.id,
                    kode_trafo="T1",
                    nama_trafo="Pertama",
                    kapasitas_mva=60,
                )
            )
            db.session.commit()

            with self.assertRaises(TrafoServiceError) as context:
                create_trafo(
                    {"gi_id": gi_a.id, "kode_trafo": "t1", "nama_trafo": "Duplikat"},
                    self.actor,
                )
            self.assertEqual(context.exception.status_code, 409)

            created = create_trafo(
                {"gi_id": gi_b.id, "kode_trafo": "t1", "nama_trafo": "GI B"},
                self.actor,
            )
            self.assertEqual(created["gi_id"], gi_b.id)

    def test_update_missing_trafo_returns_not_found(self):
        with app.app_context():
            with self.assertRaises(TrafoServiceError) as context:
                update_trafo(999, {}, self.actor)
            self.assertEqual(context.exception.status_code, 404)

    def test_audit_failure_rolls_back_trafo(self):
        with app.app_context():
            gi = self.create_gi()
            with patch(
                "backend.services.trafo.add_audit_log",
                side_effect=RuntimeError("audit gagal"),
            ):
                with self.assertRaisesRegex(RuntimeError, "audit gagal"):
                    create_trafo(
                        {"gi_id": gi.id, "kode_trafo": "ROLLBACK", "nama_trafo": "Rollback"},
                        self.actor,
                    )
            self.assertEqual(Trafo.query.filter_by(kode_trafo="ROLLBACK").count(), 0)


if __name__ == "__main__":
    unittest.main()
