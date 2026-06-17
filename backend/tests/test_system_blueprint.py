import unittest
from datetime import date

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import FeederReading, GarduInduk, Penyulang, Trafo
from backend.services.system_stats import get_sidebar_stats


class SystemBlueprintTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def setUp(self):
        with app.app_context():
            FeederReading.query.delete()
            Penyulang.query.delete()
            Trafo.query.delete()
            GarduInduk.query.delete()
            db.session.commit()

    def tearDown(self):
        db.session.remove()

    def test_sidebar_route_is_registered_from_system_blueprint(self):
        rule = next(
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/sidebar-stats"
        )
        self.assertEqual(rule.endpoint, "system.api_sidebar_stats")

    def test_service_counts_active_gi_and_alerts_for_selected_month(self):
        with app.app_context():
            gi_active = GarduInduk(kode_gi="TST", nama_gi="GI Test", aktif=True)
            gi_inactive = GarduInduk(kode_gi="OFF", nama_gi="GI Nonaktif", aktif=False)
            db.session.add_all([gi_active, gi_inactive])
            db.session.flush()

            trafo = Trafo(
                gi_id=gi_active.id,
                kode_trafo="T1",
                nama_trafo="Trafo 1",
                kapasitas_mva=60,
                aktif=True,
            )
            db.session.add(trafo)
            db.session.flush()

            feeder = Penyulang(
                gi_id=gi_active.id,
                trafo_id=trafo.id,
                kode_penyulang="F1",
                nama_penyulang="Feeder 1",
                aktif=True,
            )
            db.session.add(feeder)
            db.session.flush()

            db.session.add_all([
                FeederReading(
                    gi_id=gi_active.id,
                    trafo_id=trafo.id,
                    penyulang_id=feeder.id,
                    periode_bulan=date(2025, 5, 1),
                    flag_alert=True,
                ),
                FeederReading(
                    gi_id=gi_active.id,
                    trafo_id=trafo.id,
                    penyulang_id=feeder.id,
                    periode_bulan=date(2025, 6, 1),
                    flag_alert=True,
                ),
            ])
            db.session.commit()

            result = get_sidebar_stats(today=date(2025, 5, 20))

        self.assertEqual(result, {"gi_aktif": 1, "alert_count": 1})

    def test_endpoint_preserves_existing_response_shape(self):
        response = self.client.get("/api/sidebar-stats")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload, {"gi_aktif": 0, "alert_count": 0})


if __name__ == "__main__":
    unittest.main()
