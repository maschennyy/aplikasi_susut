import unittest
from unittest.mock import patch

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import AreaUnit, AuditLog
from backend.services.area_unit import (
    AreaUnitServiceError,
    create_area_unit,
)
from backend.services.audit_log import AuditActor


class AreaUnitServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))

    def setUp(self):
        with app.app_context():
            AuditLog.query.delete()
            AreaUnit.query.delete()
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
                AreaUnitServiceError,
                "Kode unit dan nama unit wajib diisi",
            ):
                create_area_unit({"kode_unit": ""}, self.actor)

    def test_duplicate_code_returns_conflict_error(self):
        with app.app_context():
            db.session.add(AreaUnit(kode_unit="DUP", nama_unit="Pertama"))
            db.session.commit()
            with self.assertRaises(AreaUnitServiceError) as context:
                create_area_unit(
                    {"kode_unit": "dup", "nama_unit": "Kedua"},
                    self.actor,
                )
            self.assertEqual(context.exception.status_code, 409)

    def test_audit_failure_rolls_back_area_unit(self):
        with app.app_context():
            with patch(
                "backend.services.area_unit.add_audit_log",
                side_effect=RuntimeError("audit gagal"),
            ):
                with self.assertRaisesRegex(RuntimeError, "audit gagal"):
                    create_area_unit(
                        {"kode_unit": "ROLLBACK", "nama_unit": "Rollback"},
                        self.actor,
                    )
            self.assertEqual(
                AreaUnit.query.filter_by(kode_unit="ROLLBACK").count(),
                0,
            )


if __name__ == "__main__":
    unittest.main()
