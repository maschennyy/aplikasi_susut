import unittest
from pathlib import Path

from backend.entrypoint import app


BACKEND_DIR = Path(__file__).resolve().parents[1]


class DashboardRouteCleanupTest(unittest.TestCase):
    def test_dashboard_data_route_is_not_in_app_monolith(self):
        source = (BACKEND_DIR / "app.py").read_text(encoding="utf-8")
        self.assertNotIn("@app.route('/api/dashboard-data')", source)
        self.assertIn("@app.route('/api/executive-dashboard')", source)

    def test_dashboard_data_route_is_registered_once(self):
        rules = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/dashboard-data"
        ]
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0].endpoint, "dashboard.api_dashboard_data")


if __name__ == "__main__":
    unittest.main()
