import unittest
from pathlib import Path

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app


BACKEND_DIR = Path(__file__).resolve().parents[1]


class MeterDataRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def test_feeder_and_meter_share_id_validation(self):
        for endpoint in ("feeder-data", "meter-data"):
            with self.subTest(endpoint=endpoint):
                response = self.client.get(f"/api/{endpoint}?gi_id=abc")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.get_json(),
                    {"error": "Filter GI harus berupa ID positif."},
                )

    def test_invalid_and_missing_filters_return_clear_errors(self):
        cases = [
            ("/api/meter-data?trafo_id=0", 400, "Filter Trafo harus berupa ID positif."),
            ("/api/meter-data?gi_id=999999", 404, "Gardu induk tidak ditemukan."),
            ("/api/meter-data?trafo_id=999999", 404, "Trafo tidak ditemukan."),
            ("/api/meter-data?bulan=2025-5", 400, "Format bulan harus YYYY-MM."),
            ("/api/meter-data?bulan=2025-13", 400, "Format bulan harus YYYY-MM."),
            (
                "/api/meter-data?bulan=2101-01",
                400,
                "Tahun periode harus antara 2000 dan 2100.",
            ),
        ]
        for url, status, message in cases:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.get_json(), {"error": message})

    def test_route_is_registered_once_and_removed_from_monolith(self):
        rules = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/meter-data"
        ]
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0].endpoint, "readings.api_meter_data")

        source = (BACKEND_DIR / "app.py").read_text(encoding="utf-8")
        self.assertNotIn("@app.route('/api/meter-data')", source)
        self.assertIn("@app.route('/api/transfer-data')", source)


if __name__ == "__main__":
    unittest.main()
