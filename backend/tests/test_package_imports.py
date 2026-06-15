import unittest

import config as legacy_config
import models as legacy_models
import nkwh_excel as legacy_nkwh_excel
from backend import config as package_config
from backend import models as package_models
from backend import nkwh_excel as package_nkwh_excel


class BackendPackageImportTest(unittest.TestCase):
    def test_config_bridge_uses_package_config(self):
        self.assertIs(legacy_config.Config, package_config.Config)

    def test_models_bridge_uses_one_sqlalchemy_registry(self):
        self.assertIs(legacy_models.db, package_models.db)
        self.assertIs(legacy_models.GarduInduk, package_models.GarduInduk)
        self.assertIs(legacy_models.MeterReading, package_models.MeterReading)

    def test_nkwh_bridge_uses_package_parser(self):
        self.assertIs(
            legacy_nkwh_excel.analyze_workbook,
            package_nkwh_excel.analyze_workbook,
        )
        self.assertIs(
            legacy_nkwh_excel.parse_nkwh_feeders,
            package_nkwh_excel.parse_nkwh_feeders,
        )


if __name__ == "__main__":
    unittest.main()
