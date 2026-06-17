import unittest
from datetime import date
from pathlib import Path

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import (
    EximMonthlyResult,
    FeederReading,
    GarduInduk,
    MeterReading,
    MonthlyDataStatus,
    Penyulang,
    RekapBulanan,
    Trafo,
    TransferAntarUnit,
)


BACKEND_DIR = Path(__file__).resolve().parents[1]
PERIOD = date(2025, 5, 1)


class ExecutiveDashboardRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def setUp(self):
        with app.app_context():
            EximMonthlyResult.query.delete()
            RekapBulanan.query.delete()
            TransferAntarUnit.query.delete()
            FeederReading.query.delete()
            MeterReading.query.delete()
            MonthlyDataStatus.query.delete()
            Penyulang.query.delete()
            Trafo.query.delete()
            GarduInduk.query.delete()
            db.session.add(MonthlyDataStatus(
                periode_bulan=PERIOD,
                status="FINAL",
                catatan="Periode selesai diperiksa",
            ))
            db.session.commit()

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def test_endpoint_preserves_period_readiness_and_workflow_payload(self):
        response = self.client.get(
            "/api/executive-dashboard?tahun=2025&month=5"
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["periode"], "2025-05")
        self.assertEqual(payload["periode_bulan"], "2025-05-01")
        self.assertEqual(payload["workflow"]["status"], "FINAL")
        self.assertEqual(
            payload["workflow"]["catatan"],
            "Periode selesai diperiksa",
        )
        self.assertIn("score", payload["readiness"])
        self.assertEqual(payload["readiness"]["alert_count"], 0)

    def test_invalid_month_returns_existing_error_shape(self):
        response = self.client.get(
            "/api/executive-dashboard?tahun=2025&month=13"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "Bulan tidak valid."})

    def test_route_is_registered_once_and_removed_from_monolith(self):
        rules = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/executive-dashboard"
        ]
        self.assertEqual(len(rules), 1)
        self.assertEqual(
            rules[0].endpoint,
            "dashboard.api_executive_dashboard",
        )

        source = (BACKEND_DIR / "app.py").read_text(encoding="utf-8")
        self.assertNotIn("@app.route('/api/executive-dashboard')", source)
        self.assertIn("@app.route('/api/transfer-data')", source)


if __name__ == "__main__":
    unittest.main()
