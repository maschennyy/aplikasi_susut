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


class PenyulangRouteTest(unittest.TestCase):
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
                username=f"penyulang_{role}",
                role=role,
                aktif=True,
                password_hash="test-only-hash",
            )
            db.session.add(user)
            db.session.commit()
            user_id = user.id
        token = "penyulang-csrf"
        with self.client.session_transaction() as session:
            session["user_id"] = user_id
            session["username"] = f"penyulang_{role}"
            session["role"] = role
            session["csrf_token"] = token
        return user_id, token

    def create_gi_trafo(self, kode):
        with app.app_context():
            gi = GarduInduk(kode_gi=kode, nama_gi=f"GI {kode}", aktif=True)
            db.session.add(gi)
            db.session.flush()
            trafo = Trafo(
                gi_id=gi.id,
                kode_trafo=f"T-{kode}",
                nama_trafo=f"Trafo {kode}",
                kapasitas_mva=60,
                aktif=True,
            )
            db.session.add(trafo)
            db.session.commit()
            return gi.id, trafo.id

    def test_routes_belong_only_to_master_blueprint(self):
        target_paths = {
            "/api/penyulang",
            "/api/penyulang/<int:penyulang_id>",
        }
        rules = [
            rule for rule in app.url_map.iter_rules()
            if rule.rule in target_paths
        ]
        self.assertEqual(len(rules), 2)
        self.assertEqual(
            {rule.endpoint for rule in rules},
            {"master.api_penyulang", "master.api_penyulang_update"},
        )
        self.assertNotIn("api_penyulang_list", app.view_functions)
        self.assertNotIn("api_penyulang_update", app.view_functions)

    def test_get_filters_by_status_area_trafo_and_gi(self):
        gi_a, trafo_a = self.create_gi_trafo("A")
        gi_b, trafo_b = self.create_gi_trafo("B")
        with app.app_context():
            db.session.add_all([
                Penyulang(
                    gi_id=gi_a,
                    trafo_id=trafo_a,
                    kode_penyulang="F1",
                    nama_penyulang="Aktif A",
                    area_up3="UP3 A",
                    status="AKTIF",
                    aktif=True,
                ),
                Penyulang(
                    gi_id=gi_a,
                    trafo_id=trafo_a,
                    kode_penyulang="F2",
                    nama_penyulang="Nonaktif A",
                    area_up3="UP3 A",
                    status="NONAKTIF",
                    aktif=False,
                ),
                Penyulang(
                    gi_id=gi_b,
                    trafo_id=trafo_b,
                    kode_penyulang="F3",
                    nama_penyulang="Cadangan B",
                    area_up3="UP3 B",
                    status="CADANGAN",
                    aktif=True,
                ),
            ])
            db.session.commit()

        active_a = self.client.get(f"/api/penyulang?trafo_id={trafo_a}").get_json()
        all_a = self.client.get(f"/api/penyulang?trafo_id={trafo_a}&all=1").get_json()
        nonactive = self.client.get("/api/penyulang?status=nonaktif").get_json()
        area_b = self.client.get("/api/penyulang?area_up3=UP3%20B").get_json()
        gi_b_rows = self.client.get(f"/api/penyulang?gi_id={gi_b}").get_json()

        self.assertEqual([row["kode_penyulang"] for row in active_a], ["F1"])
        self.assertEqual({row["kode_penyulang"] for row in all_a}, {"F1", "F2"})
        self.assertEqual([row["kode_penyulang"] for row in nonactive], ["F2"])
        self.assertEqual([row["kode_penyulang"] for row in area_b], ["F3"])
        self.assertEqual([row["kode_penyulang"] for row in gi_b_rows], ["F3"])

    def test_operator_create_syncs_gi_and_status_with_audit(self):
        gi_a, trafo_a = self.create_gi_trafo("A")
        gi_b, _ = self.create_gi_trafo("B")
        user_id, token = self.login_as("operator")

        response = self.client.post(
            "/api/penyulang",
            json={
                "trafo_id": trafo_a,
                "gi_id": gi_b,
                "kode_penyulang": " f1 ",
                "nama_penyulang": "Feeder 1",
                "area_up3": "UP3 A",
                "status": "NONAKTIF",
                "aktif": True,
            },
            headers={"X-CSRFToken": token},
        )

        self.assertEqual(response.status_code, 201)
        payload = response.get_json()
        self.assertEqual(payload["gi_id"], gi_a)
        self.assertEqual(payload["status"], "NONAKTIF")
        self.assertFalse(payload["aktif"])

        with app.app_context():
            audit = AuditLog.query.filter_by(action="CREATE_PENYULANG").one()
            detail = json.loads(audit.detail_json)
            self.assertEqual(audit.user_id, user_id)
            self.assertEqual(detail["gi_id"], gi_a)
            self.assertEqual(detail["trafo_id"], trafo_a)

    def test_viewer_cannot_create_penyulang(self):
        _, trafo_id = self.create_gi_trafo("NO")
        _, token = self.login_as("viewer")
        response = self.client.post(
            "/api/penyulang",
            json={
                "trafo_id": trafo_id,
                "kode_penyulang": "NO",
                "nama_penyulang": "Tidak Boleh",
            },
            headers={"X-CSRFToken": token},
        )
        self.assertEqual(response.status_code, 403)
        with app.app_context():
            self.assertEqual(Penyulang.query.count(), 0)

    def test_update_moves_trafo_syncs_gi_and_status(self):
        gi_a, trafo_a = self.create_gi_trafo("A")
        gi_b, trafo_b = self.create_gi_trafo("B")
        with app.app_context():
            feeder = Penyulang(
                gi_id=gi_a,
                trafo_id=trafo_a,
                kode_penyulang="OLD",
                nama_penyulang="Lama",
                area_up3="UP3 A",
                status="AKTIF",
                aktif=True,
            )
            db.session.add(feeder)
            db.session.commit()
            feeder_id = feeder.id
        _, token = self.login_as("admin")

        response = self.client.patch(
            f"/api/penyulang/{feeder_id}",
            json={
                "trafo_id": trafo_b,
                "kode_penyulang": "NEW",
                "nama_penyulang": "Baru",
                "area_up3": "UP3 B",
                "status": "CADANGAN",
            },
            headers={"X-CSRFToken": token},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["trafo_id"], trafo_b)
        self.assertEqual(payload["gi_id"], gi_b)
        self.assertEqual(payload["status"], "CADANGAN")
        self.assertTrue(payload["aktif"])

        with app.app_context():
            detail = json.loads(
                AuditLog.query.filter_by(action="UPDATE_PENYULANG").one().detail_json
            )
            self.assertEqual(detail["before"]["gi_id"], gi_a)
            self.assertEqual(detail["after"]["gi_id"], gi_b)


if __name__ == "__main__":
    unittest.main()
