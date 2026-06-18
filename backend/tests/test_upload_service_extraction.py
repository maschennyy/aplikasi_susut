"""Architecture checks for upload import service extraction."""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class UploadServiceExtractionTest(unittest.TestCase):
    def test_upload_route_no_longer_uses_bridge_or_app_module(self):
        source = (ROOT / "backend" / "routes" / "upload.py").read_text(encoding="utf-8")

        self.assertIn("from ..services.upload_import import", source)
        self.assertNotIn("._app_bridge", source)
        self.assertNotIn("core()", source)
        self.assertNotIn("app_module", source)

    def test_upload_business_logic_is_removed_from_app_monolith(self):
        source = (ROOT / "backend" / "app.py").read_text(encoding="utf-8")

        for name in (
            "def _check_upload_rate",
            "def _validate_upload_file",
            "def _read_upload_table",
            "def _find_or_create_gi_from_name",
            "def _apply_nkwh_registers",
            "def _import_nkwh_exim_rows",
            "def _nkwh_import_blockers",
        ):
            self.assertNotIn(name, source)

    def test_upload_service_owns_import_processing(self):
        source = (ROOT / "backend" / "services" / "upload_import.py").read_text(encoding="utf-8")

        self.assertIn("def analyze_nkwh_upload", source)
        self.assertIn("def import_nkwh_upload", source)
        self.assertIn("def import_penyulang_upload", source)
        self.assertIn('current_app.config["MAX_IMPORT_ROWS"]', source)
        self.assertIn('current_app.config["MAX_CONTENT_LENGTH"]', source)


if __name__ == "__main__":
    unittest.main()
