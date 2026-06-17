import unittest
from datetime import date
from pathlib import Path

from backend.services.monthly_workflow import normalize_workflow_status, workflow_period


BACKEND_DIR = Path(__file__).resolve().parents[1]


class MonthlyServiceExtractionTest(unittest.TestCase):
    def test_period_parser(self):
        self.assertEqual(workflow_period("2025-05"), date(2025, 5, 1))
        self.assertEqual(workflow_period("2025-05-17"), date(2025, 5, 1))

    def test_status_aliases(self):
        self.assertEqual(normalize_workflow_status("sudah upload"), "SUDAH_UPLOAD")
        self.assertEqual(normalize_workflow_status("checked"), "SUDAH_DICEK")

    def test_routes_use_monthly_services(self):
        workflow_source = (BACKEND_DIR / "routes" / "monthly_workflow.py").read_text(encoding="utf-8")
        dashboard_source = (BACKEND_DIR / "routes" / "dashboard.py").read_text(encoding="utf-8")
        bridge_source = (BACKEND_DIR / "routes" / "_app_bridge.py").read_text(encoding="utf-8")

        self.assertNotIn("from ._app_bridge import core", workflow_source)
        self.assertIn("monthly_readiness import readiness_payload", workflow_source)
        self.assertIn("monthly_workflow import workflow_payload", dashboard_source)
        self.assertIn('"_workflow_payload": workflow_payload', bridge_source)
        self.assertIn('"_readiness_payload": readiness_payload', bridge_source)


if __name__ == "__main__":
    unittest.main()
