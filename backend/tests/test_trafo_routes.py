import json
import unittest

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import (
    AuditLog,
    FeederReading,
    GarduInduk,
    MeterReading,
    Penyulang,
    Trafo,
    User,
)


class TrafoRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def setUp(self):
        with app.app_context():
            AuditLog.query.delete()
            FeederReading.query.delete()
            MeterReading.query.delete()
            Penyulang.query.delete()
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
                username=f"trafo_{role}",
                role=role,
                aktif=True,
                password_hash="test-only-hash",
            )
            db.session.add(user)
            db.session.commit()
            user_id = user.id
        token = "trafo-csrf"
        with self.client.session_transaction() as session:
            session["user_id"] = user_id
            session["username"] = f"trafo_{role}"
            session["role"] = role
            session["csrf_token"] = token
        return user_id, token

    def create_gi(self, kode):
        with app.app_context():
            gi = GarduInduk(kode_gi=kode, nama_gi=f"GI {kode}", aktif=True)
            db.session.add(gi)
            db.session.commit()
            return gi.id

    def test_routes_belong_only_to_master_blueprint(self):
        rules = [rule for rule in app.url_map.iter_rules() if rule.rule.startswith("/api/trafo")]
        self.assertEqual(len(rules), 2)
        self.assertEqual(
            {rule.endpoint for rule in rules},
            {"master.api_trafo", "master.api_trafo_update"},
        )
        self.assertNotIn("api_trafo", app.view_functions)
        self.assertNotIn("api_trafo_update", app.view_functions)

    def test_get_filters_by_active_and_gi(self):
        gi_a = self.create_gi("A")
        gi_b = self.create_gi("B")
        with app.app_context():
            db.session.add_all([
                Trafo(gi_id=gi_a, kode_trafo="T1", nama_trafo="A1", kapasitas_mva=60, aktif=True),
                Trafo(gi_id=gi_a, kode_trafo="T2", nama_trafo="A2", kapasitas_mva=30, aktif=False),
                Trafo(gi_id=gi_b, kode_trafo="T1", nama_trafo="B1", kapasitas_mva=20, aktif=True),
            ])
            db.session.commit()

        rows = self.client.get(f"/api/trafo?gi_id={gi_a}").get_json()
        all_rows = self.client.get(f"/api/trafo?gi_id={gi_a}&all=1").get_json()
        self.assertEqual([row["kode_trafo"] for row in rows], ["T1"])
        self.assertEqual({row["kode_trafo"] for row in all_rows}, {"T1", "T2"})

    def test_operator_create_writes_audit(self):
        gi_id = self.create_gi("TNG")
        user_id, token = self.login_as("operator")
        response = self.client.post(
            "/api/trafo",
            json={
                "gi_id": gi_id,
                "kode_trafo": " t1 ",
                "nama_trafo": "Trafo 1",
                "kapasitas_mva": "60.5",
                "tegangan_kv": "150",
            },
            headers={"X-CSRFToken": token},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["kode_trafo"], "T1")
        self.assertEqual(response.get_json()["kapasitas_mva"], 60.5)
        with app.app_context():
            audit = AuditLog.query.filter_by(action="CREATE_TRAFO").one()
            self.assertEqual(audit.user_id, user_id)
            self.assertEqual(json.loads(audit.detail_json), {"kode_trafo": "T1", "gi_id": gi_id})

    def test_viewer_cannot_create_trafo(self):
        gi_id = self.create_gi("NO")
        _, token = self.login_as("viewer")
        response = self.client.post(
            "/api/trafo",
            json={"gi_id": gi_id, "kode_trafo": "T1", "nama_trafo": "Tidak Boleh"},
            headers={"X-CSRFToken": token},
        )
        self.assertEqual(response.status_code, 403)
        with app.app_context():
            self.assertEqual(Trafo.query.count(), 0)

    def test_update_can_move_gi_and_writes_audit(self):
        gi_a = self.create_gi("A")
        gi_b = self.create_gi("B")
        with app.app_context():
            trafo = Trafo(gi_id=gi_a, kode_trafo="OLD", nama_trafo="Lama", kapasitas_mva=10, tegangan_kv=20)
            db.session.add(trafo)
            db.session.commit()
            trafo_id = trafo.id
        _, token = self.login_as("admin")
        response = self.client.patch(
            f"/api/trafo/{trafo_id}",
            json={"gi_id": gi_b, "kode_trafo": "NEW", "nama_trafo": "Baru", "aktif": False},
            headers={"X-CSRFToken": token},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["gi_id"], gi_b)
        with app.app_context():
            detail = json.loads(AuditLog.query.filter_by(action="UPDATE_TRAFO").one().detail_json)
            self.assertEqual(detail["before"]["gi_id"], gi_a)
            self.assertEqual(detail["after"]["gi_id"], gi_b)


if __name__ == "__main__":
    unittest.main()
