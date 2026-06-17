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
from backend.services.executive_dashboard import get_executive_dashboard


PERIOD = date(2025, 5, 1)


class ExecutiveDashboardServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))

    def setUp(self):
        with app.app_context():
            FeederReading.query.delete()
            MeterReading.query.delete()
            Penyulang.query.delete()
            Trafo.query.delete()
            GarduInduk.query.delete()
            db.session.commit()
            self._seed()

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def _seed(self):
        gi_a = GarduInduk(kode_gi="A", nama_gi="GI A", aktif=True)
        gi_b = GarduInduk(kode_gi="B", nama_gi="GI B", aktif=True)
        db.session.add_all([gi_a, gi_b])
        db.session.flush()

        trafo_a = Trafo(
            gi_id=gi_a.id,
            kode_trafo="TA",
            nama_trafo="Trafo A",
            kapasitas_mva=60,
            aktif=True,
        )
        trafo_b = Trafo(
            gi_id=gi_b.id,
            kode_trafo="TB",
            nama_trafo="Trafo B",
            kapasitas_mva=60,
            aktif=True,
        )
        db.session.add_all([trafo_a, trafo_b])
        db.session.flush()

        feeders = []
        feeder_specs = [
            (trafo_a, gi_a, "A1", "Feeder A1", None),
            (trafo_a, gi_a, "A2", "Feeder A2", "UP3 A"),
            (trafo_b, gi_b, "B1", "Feeder B1", "UP3 B"),
            (trafo_b, gi_b, "B2", "Feeder B2", "UP3 B"),
        ]
        for trafo, gi, code, name, area in feeder_specs:
            feeder = Penyulang(
                gi_id=gi.id,
                trafo_id=trafo.id,
                kode_penyulang=code,
                nama_penyulang=name,
                area_up3=area,
                status="AKTIF",
                aktif=True,
            )
            db.session.add(feeder)
            feeders.append(feeder)
        db.session.flush()

        db.session.add_all([
            MeterReading(
                gi_id=gi_a.id,
                trafo_id=trafo_a.id,
                periode_bulan=PERIOD,
                mu_kwh_wbp=100,
                mp_kwh_wbp=95,
            ),
            MeterReading(
                gi_id=gi_b.id,
                trafo_id=trafo_b.id,
                periode_bulan=PERIOD,
                mu_kwh_wbp=200,
                mp_kwh_wbp=190,
            ),
        ])

        reading_specs = [
            (feeders[0], trafo_a, gi_a, 50, 10, True, None),
            (feeders[1], trafo_a, gi_a, 30, 25, False, None),
            (feeders[2], trafo_b, gi_b, 70, 5, False, None),
            (feeders[3], trafo_b, gi_b, 70, -30, False, "Manual"),
        ]
        for feeder, trafo, gi, kwh, deviation, alert, kind in reading_specs:
            db.session.add(FeederReading(
                gi_id=gi.id,
                trafo_id=trafo.id,
                penyulang_id=feeder.id,
                periode_bulan=PERIOD,
                kwh_wbp=kwh,
                deviasi_persen=deviation,
                flag_alert=alert,
                anomaly_type=kind,
            ))
        db.session.commit()

    def test_service_builds_totals_deviations_and_anomalies(self):
        with app.app_context():
            payload = get_executive_dashboard(
                period=PERIOD,
                readiness_provider=lambda period: {
                    "period": period.isoformat()
                },
                workflow_provider=lambda period: {"status": "TEST"},
            )

        self.assertEqual(payload["total_kwh_masuk"], 300.0)
        self.assertEqual(payload["total_kwh_keluar"], 220.0)
        self.assertEqual(payload["susut_kwh"], 80.0)
        self.assertEqual(payload["susut_persen"], 26.67)
        self.assertEqual(
            [row["nama_gi"] for row in payload["gi_deviasi_terbesar"]],
            ["GI B", "GI A"],
        )
        self.assertEqual(
            [row["kode_penyulang"] for row in payload["penyulang_anomali"]],
            ["B2", "A2", "A1"],
        )
        self.assertEqual(
            payload["penyulang_anomali"][0]["anomaly_type"],
            "Manual",
        )
        self.assertEqual(
            payload["penyulang_anomali"][1]["anomaly_type"],
            "Deviasi Tinggi",
        )
        self.assertEqual(
            payload["penyulang_anomali"][2]["anomaly_type"],
            "Naik/Turun Tidak Wajar",
        )
        self.assertEqual(
            payload["penyulang_anomali"][2]["area_up3"],
            "Belum Dipetakan",
        )
        self.assertEqual(payload["readiness"], {"period": "2025-05-01"})
        self.assertEqual(payload["workflow"], {"status": "TEST"})


if __name__ == "__main__":
    unittest.main()
