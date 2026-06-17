import unittest
from pathlib import Path

from backend.entrypoint import app


BACKEND_DIR = Path(__file__).resolve().parents[1]


class DashboardRouteCleanupTest(unittest.TestCase):
    def test_dashboard_routes_are_not_in_app_monolith(self):
        source = (BACKEND_DIR / "app.py").read_text(encoding="utf-8")
        self.assertNotIn("@app.route('/api/dashboard-data')", source)
        self.assertNotIn("@app.route('/api/executive-dashboard')", source)
        self.assertIn("@app.route('/api/transfer-data')", source)

    def test_dashboard_routes_are_registered_once(self):
        expected = {
            "/api/dashboard-data": "dashboard.api_dashboard_data",
            "/api/executive-dashboard": "dashboard.api_executive_dashboard",
        }
        for path, endpoint in expected.items():
            rules = [
                rule
                for rule in app.url_map.iter_rules()
                if rule.rule == path
            ]
            self.assertEqual(len(rules), 1, path)
            self.assertEqual(rules[0].endpoint, endpoint)


if __name__ == "__main__":
    unittest.main()
