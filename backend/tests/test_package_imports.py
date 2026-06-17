import unittest
from pathlib import Path

from backend import config as package_config
from backend import models as package_models
from backend import nkwh_excel as package_nkwh_excel

ROOT_DIR = Path(__file__).resolve().parents[2]


class BackendPackageImportTest(unittest.TestCase):
    def test_backend_package_imports_are_canonical(self):
        self.assertEqual(package_config.Config.__module__, "backend.config")
        self.assertEqual(package_models.db.__module__, "flask_sqlalchemy.extension")
        self.assertEqual(package_models.GarduInduk.__module__, "backend.models")
        self.assertEqual(package_models.MeterReading.__module__, "backend.models")
        self.assertEqual(package_nkwh_excel.analyze_workbook.__module__, "backend.nkwh_excel")
        self.assertEqual(package_nkwh_excel.parse_nkwh_feeders.__module__, "backend.nkwh_excel")

    def test_legacy_root_python_bridges_are_removed(self):
        for filename in ("config.py", "models.py", "nkwh_excel.py"):
            self.assertFalse((ROOT_DIR / filename).exists(), filename)


if __name__ == "__main__":
    unittest.main()
