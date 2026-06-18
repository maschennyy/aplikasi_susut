import unittest
from pathlib import Path

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app


BACKEND_DIR = Path(__file__).resolve().parents[1]


class FeederDataRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def test_invalid_filter_ids_return_clear_errors(self):
        cases = [
            ("/api/feeder-data?gi_id=abc", 400, "Filter GI harus berupa ID positif."),
            ("/api/feeder-data?gi_id=-1", 400, "Filter GI harus berupa ID positif."),
            ("/api/feeder-data?trafo_id=0", 400, "Filter Trafo harus berupa ID positif."),
            ("/api/feeder-data?penyulang_id=abc", 400, "Filter Penyulang harus berupa ID positif."),
            ("/api/feeder-data?penyulang_id=0", 400, "Filter Penyulang harus berupa ID positif."),
            ("/api/feeder-data?gi_id=999999", 404, "Gardu induk tidak ditemukan."),
            ("/api/feeder-data?trafo_id=999999", 404, "Trafo tidak ditemukan."),
            ("/api/feeder-data?penyulang_id=999999", 404, "Penyulang tidak ditemukan."),
        ]
        for url, status, message in cases:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.get_json(), {"error": message})

    def test_month_requires_strict_yyyy_mm_and_supported_year(self):
        cases = [
            ("2025-5", "Format bulan harus YYYY-MM."),
            ("2025-13", "Format bulan harus YYYY-MM."),
            ("1999-12", "Tahun periode harus antara 2000 dan 2100."),
        ]
        for month, message in cases:
            with self.subTest(month=month):
                response = self.client.get(
                    "/api/feeder-data",
                    query_string={"bulan": month},
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json(), {"error": message})

    def test_pagination_parameters_are_validated_and_capped(self):
        invalid = self.client.get("/api/feeder-data?page=abc")
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.get_json(), {"error": "Page harus berupa angka positif."})

        response = self.client.get("/api/feeder-data?page=1&page_size=999")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn("rows", payload)
        self.assertIn("total", payload)
        self.assertEqual(payload["page"], 1)
        self.assertEqual(payload["page_size"], 500)

    def test_route_is_registered_once_and_removed_from_monolith(self):
        rules = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/feeder-data"
        ]
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0].endpoint, "readings.api_feeder_data")

        source = (BACKEND_DIR / "app.py").read_text(encoding="utf-8")
        self.assertNotIn("@app.route('/api/feeder-data')", source)
        self.assertIn("@app.route('/api/transfer-data')", source)


if __name__ == "__main__":
    unittest.main()
