import json
import unittest

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import AreaUnit, AuditLog, User


class AreaUnitRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def setUp(self):
        with app.app_context():
            AuditLog.query.delete()
            AreaUnit.query.delete()
            User.query.delete()
            db.session.commit()
        with self.client.session_transaction() as session:
            session.clear()

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def login_as(self, role):
        with app.app_context():
            user = User(
                username=f"user_{role}",
                role=role,
                aktif=True,
                password_hash="test-only-hash",
            )
            db.session.add(user)
            db.session.commit()
            user_id = user.id
        token = "area-unit-csrf"
        with self.client.session_transaction() as session:
            session["user_id"] = user_id
            session["username"] = f"user_{role}"
            session["role"] = role
            session["csrf_token"] = token
        return user_id, token

    def test_routes_belong_to_master_blueprint(self):
        rules = {
            rule.rule: rule.endpoint
            for rule in app.url_map.iter_rules()
            if rule.rule.startswith("/api/area-unit")
        }
        self.assertEqual(rules["/api/area-unit"], "master.api_area_unit")
        self.assertEqual(
            rules["/api/area-unit/<int:unit_id>"],
            "master.api_area_unit_update",
        )

    def test_get_hides_inactive_unless_all_requested(self):
        with app.app_context():
            db.session.add_all([
                AreaUnit(kode_unit="A", nama_unit="Aktif", aktif=True),
                AreaUnit(kode_unit="X", nama_unit="Nonaktif", aktif=False),
            ])
            db.session.commit()
        active = self.client.get("/api/area-unit").get_json()
        all_rows = self.client.get("/api/area-unit?all=1").get_json()
        self.assertEqual([row["kode_unit"] for row in active], ["A"])
        self.assertEqual({row["kode_unit"] for row in all_rows}, {"A", "X"})

    def test_operator_create_writes_audit(self):
        user_id, token = self.login_as("operator")
        response = self.client.post(
            "/api/area-unit",
            json={"kode_unit": " up3-a ", "nama_unit": "UP3 A"},
            headers={"X-CSRFToken": token},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["kode_unit"], "UP3-A")
        with app.app_context():
            audit = AuditLog.query.filter_by(action="CREATE_AREA_UNIT").one()
            self.assertEqual(audit.user_id, user_id)
            self.assertEqual(json.loads(audit.detail_json), {"kode_unit": "UP3-A"})

    def test_viewer_is_denied(self):
        _, token = self.login_as("viewer")
        response = self.client.post(
            "/api/area-unit",
            json={"kode_unit": "NO", "nama_unit": "Tidak Boleh"},
            headers={"X-CSRFToken": token},
        )
        self.assertEqual(response.status_code, 403)
        with app.app_context():
            self.assertEqual(AreaUnit.query.count(), 0)

    def test_update_writes_before_and_after_audit(self):
        with app.app_context():
            unit = AreaUnit(kode_unit="OLD", nama_unit="Lama", aktif=True)
            db.session.add(unit)
            db.session.commit()
            unit_id = unit.id
        _, token = self.login_as("admin")
        response = self.client.patch(
            f"/api/area-unit/{unit_id}",
            json={"kode_unit": "NEW", "nama_unit": "Baru", "aktif": False},
            headers={"X-CSRFToken": token},
        )
        self.assertEqual(response.status_code, 200)
        with app.app_context():
            audit = AuditLog.query.filter_by(action="UPDATE_AREA_UNIT").one()
            detail = json.loads(audit.detail_json)
            self.assertEqual(detail["before"]["kode_unit"], "OLD")
            self.assertEqual(detail["after"]["kode_unit"], "NEW")


if __name__ == "__main__":
    unittest.main()
