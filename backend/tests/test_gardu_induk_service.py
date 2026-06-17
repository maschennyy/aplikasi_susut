import unittest
from unittest.mock import patch

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import AuditLog, GarduInduk, Trafo
from backend.services.audit_log import AuditActor
from backend.services.gardu_induk import (
    GarduIndukServiceError,
    create_gardu_induk,
    update_gardu_induk,
)


class GarduIndukServiceTest(unittest.TestCase):
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

    def test_required_fields_are_validated(self):
        with app.app_context():
            with self.assertRaisesRegex(
                GarduIndukServiceError,
                "Kode GI dan nama GI wajib diisi",
            ):
                create_gardu_induk({"kode_gi": ""}, self.actor)

    def test_duplicate_code_returns_conflict(self):
        with app.app_context():
            db.session.add(GarduInduk(kode_gi="DUP", nama_gi="Pertama"))
            db.session.commit()
            with self.assertRaises(GarduIndukServiceError) as context:
                create_gardu_induk(
                    {"kode_gi": "dup", "nama_gi": "Kedua"},
                    self.actor,
                )
            self.assertEqual(context.exception.status_code, 409)

    def test_update_missing_gi_returns_not_found(self):
        with app.app_context():
            with self.assertRaises(GarduIndukServiceError) as context:
                update_gardu_induk(
                    999,
                    {"nama_gi": "Tidak Ada"},
                    self.actor,
                )
            self.assertEqual(context.exception.status_code, 404)

    def test_audit_failure_rolls_back_gardu_induk(self):
        with app.app_context():
            with patch(
                "backend.services.gardu_induk.add_audit_log",
                side_effect=RuntimeError("audit gagal"),
            ):
                with self.assertRaisesRegex(RuntimeError, "audit gagal"):
                    create_gardu_induk(
                        {"kode_gi": "ROLLBACK", "nama_gi": "Rollback"},
                        self.actor,
                    )
            self.assertEqual(
                GarduInduk.query.filter_by(kode_gi="ROLLBACK").count(),
                0,
            )


if __name__ == "__main__":
    unittest.main()
