import unittest
from datetime import date

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import (
    FeederReading,
    GarduInduk,
    MeterReading,
    Penyulang,
    Trafo,
)
from backend.services.dashboard_data import get_dashboard_data


class DashboardDataBlueprintTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def setUp(self):
        with app.app_context():
            FeederReading.query.delete()
            MeterReading.query.delete()
            Penyulang.query.delete()
            Trafo.query.delete()
            GarduInduk.query.delete()
            db.session.commit()
            self._seed_dashboard_data()

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def _seed_dashboard_data(self):
        gi = GarduInduk(
            kode_gi="DASH",
            nama_gi="GI Dashboard",
            aktif=True,
        )
        db.session.add(gi)
        db.session.flush()

        trafo_1 = Trafo(
            gi_id=gi.id,
            kode_trafo="T1",
            nama_trafo="Trafo 1",
            kapasitas_mva=60,
            aktif=True,
        )
        trafo_2 = Trafo(
            gi_id=gi.id,
            kode_trafo="T2",
            nama_trafo="Trafo 2",
            kapasitas_mva=60,
            aktif=True,
        )
        db.session.add_all([trafo_1, trafo_2])
        db.session.flush()

        feeder_1 = Penyulang(
            gi_id=gi.id,
            trafo_id=trafo_1.id,
            kode_penyulang="F1",
            nama_penyulang="Feeder 1",
            status="AKTIF",
            aktif=True,
        )
        feeder_2 = Penyulang(
            gi_id=gi.id,
            trafo_id=trafo_2.id,
            kode_penyulang="F2",
            nama_penyulang="Feeder 2",
            status="AKTIF",
            aktif=True,
        )
        db.session.add_all([feeder_1, feeder_2])
        db.session.flush()

        db.session.add_all([
            MeterReading(
                gi_id=gi.id,
                trafo_id=trafo_1.id,
                periode_bulan=date(2025, 1, 1),
                mu_kwh_wbp=100,
                mu_kwh_lwbp1=20,
                mu_kwh_lwbp2=None,
            ),
            MeterReading(
                gi_id=gi.id,
                trafo_id=trafo_2.id,
                periode_bulan=date(2025, 1, 1),
                mu_kwh_wbp=80,
                mu_kwh_lwbp1=None,
                mu_kwh_lwbp2=None,
            ),
            MeterReading(
                gi_id=gi.id,
                trafo_id=trafo_1.id,
                periode_bulan=date(2025, 2, 1),
                mu_kwh_wbp=0,
                mu_kwh_lwbp1=0,
                mu_kwh_lwbp2=0,
            ),
            MeterReading(
                gi_id=gi.id,
                trafo_id=trafo_1.id,
                periode_bulan=date(2025, 3, 1),
                mu_kwh_wbp=300,
                mu_kwh_lwbp1=0,
                mu_kwh_lwbp2=0,
            ),
            MeterReading(
                gi_id=gi.id,
                trafo_id=trafo_1.id,
                periode_bulan=date(2024, 1, 1),
                mu_kwh_wbp=50,
                mu_kwh_lwbp1=0,
                mu_kwh_lwbp2=0,
            ),
        ])

        db.session.add_all([
            FeederReading(
                gi_id=gi.id,
                trafo_id=trafo_1.id,
                penyulang_id=feeder_1.id,
                periode_bulan=date(2025, 1, 1),
                kwh_wbp=100,
                kwh_lwbp1=0,
                kwh_lwbp2=0,
            ),
            FeederReading(
                gi_id=gi.id,
                trafo_id=trafo_2.id,
                penyulang_id=feeder_2.id,
                periode_bulan=date(2025, 1, 1),
                kwh_wbp=50,
                kwh_lwbp1=0,
                kwh_lwbp2=0,
            ),
            FeederReading(
                gi_id=gi.id,
                trafo_id=trafo_1.id,
                penyulang_id=feeder_1.id,
                periode_bulan=date(2024, 1, 1),
                kwh_wbp=40,
                kwh_lwbp1=0,
                kwh_lwbp2=0,
            ),
            FeederReading(
                gi_id=gi.id,
                trafo_id=trafo_1.id,
                penyulang_id=feeder_1.id,
                periode_bulan=date(2025, 4, 1),
                kwh_wbp=999,
                kwh_lwbp1=0,
                kwh_lwbp2=0,
            ),
        ])
        db.session.commit()

    def test_route_is_registered_once_from_dashboard_blueprint(self):
        rules = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/dashboard-data"
        ]
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0].endpoint, "dashboard.api_dashboard_data")

    def test_service_preserves_monthly_and_total_calculation(self):
        with app.app_context():
            payload = get_dashboard_data(year=2025)

        self.assertEqual(
            [row["tanggal"] for row in payload["data_bulanan"]],
            ["2025-01-01", "2025-02-01", "2025-03-01"],
        )
        self.assertEqual(payload["data_bulanan"][0], {
            "tanggal": "2025-01-01",
            "meter_utama": 200.0,
            "total_penyulang": 150.0,
            "susut_kwh": 50.0,
            "persentase_susut": 25.0,
        })
        self.assertEqual(payload["data_bulanan"][1]["persentase_susut"], 0)
        self.assertEqual(payload["data_bulanan"][2]["total_penyulang"], 0.0)
        self.assertEqual(payload["data_bulanan"][2]["persentase_susut"], 100.0)
        self.assertEqual(payload["total"], {
            "meter_utama": 500.0,
            "total_penyulang": 150.0,
            "total_susut": 350.0,
            "persentase_total": 70.0,
        })

    def test_endpoint_filters_year_and_excludes_feeder_only_month(self):
        response = self.client.get("/api/dashboard-data?tahun=2024")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["data_bulanan"], [{
            "tanggal": "2024-01-01",
            "meter_utama": 50.0,
            "total_penyulang": 40.0,
            "susut_kwh": 10.0,
            "persentase_susut": 20.0,
        }])
        self.assertNotIn(
            "2025-04-01",
            [row["tanggal"] for row in payload["data_bulanan"]],
        )


if __name__ == "__main__":
    unittest.main()
