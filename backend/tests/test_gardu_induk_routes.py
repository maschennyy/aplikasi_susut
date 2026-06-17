import json
import unittest

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import AuditLog, GarduInduk, Trafo, User


class GarduIndukRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def setUp(self):
        with app.app_context():
            AuditLog.query.delete()
            Trafo.query.delete()
            GarduInduk.query.delete()
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
                username=f"gi_{role}",
                role=role,
                aktif=True,
                password_hash="test-only-hash",
            )
            db.session.add(user)
            db.session.commit()
            user_id = user.id
        token = "gardu-induk-csrf"
        with self.client.session_transaction() as session:
            session["user_id"] = user_id
            session["username"] = f"gi_{role}"
            session["role"] = role
            session["csrf_token"] = token
        return user_id, token

    def test_routes_belong_only_to_master_blueprint(self):
        rules = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule.startswith("/api/gardu-induk")
        ]
        self.assertEqual(len(rules), 2)
        self.assertEqual(
            {rule.endpoint for rule in rules},
            {"master.api_gardu_induk", "master.api_gardu_induk_update"},
        )
        self.assertNotIn("api_gardu_induk", app.view_functions)
        self.assertNotIn("api_gardu_induk_update", app.view_functions)

    def test_get_hides_inactive_unless_all_requested(self):
        with app.app_context():
            db.session.add_all([
                GarduInduk(kode_gi="A", nama_gi="GI Aktif", aktif=True),
                GarduInduk(kode_gi="X", nama_gi="GI Nonaktif", aktif=False),
            ])
            db.session.commit()

        active = self.client.get("/api/gardu-induk").get_json()
        all_rows = self.client.get("/api/gardu-induk?all=1").get_json()

        self.assertEqual([row["kode_gi"] for row in active], ["A"])
        self.assertEqual({row["kode_gi"] for row in all_rows}, {"A", "X"})

    def test_operator_create_writes_audit(self):
        user_id, token = self.login_as("operator")
        response = self.client.post(
            "/api/gardu-induk",
            json={
                "kode_gi": " tng ",
                "nama_gi": "GI Tangerang",
                "area": "UP3 Tangerang",
                "unit": "UID Banten",
                "alamat": "Tangerang",
            },
            headers={"X-CSRFToken": token},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["kode_gi"], "TNG")
        with app.app_context():
            audit = AuditLog.query.filter_by(action="CREATE_GI").one()
            self.assertEqual(audit.user_id, user_id)
            self.assertEqual(json.loads(audit.detail_json), {"kode_gi": "TNG"})

    def test_viewer_cannot_create_gardu_induk(self):
        _, token = self.login_as("viewer")
        response = self.client.post(
            "/api/gardu-induk",
            json={"kode_gi": "NO", "nama_gi": "Tidak Boleh"},
            headers={"X-CSRFToken": token},
        )

        self.assertEqual(response.status_code, 403)
        with app.app_context():
            self.assertEqual(GarduInduk.query.count(), 0)

    def test_update_writes_before_and_after_audit(self):
        with app.app_context():
            gi = GarduInduk(
                kode_gi="OLD",
                nama_gi="GI Lama",
                area="Area Lama",
                aktif=True,
            )
            db.session.add(gi)
            db.session.commit()
            gi_id = gi.id
        _, token = self.login_as("admin")

        response = self.client.patch(
            f"/api/gardu-induk/{gi_id}",
            json={
                "kode_gi": "NEW",
                "nama_gi": "GI Baru",
                "area": "Area Baru",
                "aktif": False,
            },
            headers={"X-CSRFToken": token},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["aktif"])
        with app.app_context():
            audit = AuditLog.query.filter_by(action="UPDATE_GI").one()
            detail = json.loads(audit.detail_json)
            self.assertEqual(detail["before"]["kode_gi"], "OLD")
            self.assertEqual(detail["after"]["kode_gi"], "NEW")


if __name__ == "__main__":
    unittest.main()
