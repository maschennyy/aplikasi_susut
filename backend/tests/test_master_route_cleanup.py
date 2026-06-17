import unittest
from pathlib import Path

from backend.entrypoint import app


BACKEND_DIR = Path(__file__).resolve().parents[1]


class MasterRouteCleanupTest(unittest.TestCase):
    def test_legacy_master_route_source_is_removed(self):
        source = (BACKEND_DIR / "app.py").read_text(encoding="utf-8")
        forbidden = (
            "@app.route('/api/area-unit'",
            "@app.route('/api/gardu-induk'",
            "@app.route('/api/trafo'",
            "@app.route('/api/penyulang',",
            "@app.route('/api/penyulang/<int:penyulang_id>'",
        )
        for marker in forbidden:
            self.assertNotIn(marker, source)

        self.assertIn("@app.route('/api/penyulang-area')", source)

    def test_route_compatibility_bridge_is_removed(self):
        self.assertFalse((BACKEND_DIR / "route_compat.py").exists())
        entrypoint = (BACKEND_DIR / "entrypoint.py").read_text(encoding="utf-8")
        self.assertNotIn("normalize_migrated_routes", entrypoint)
        self.assertNotIn("route_compat", entrypoint)

    def test_each_master_route_is_registered_once(self):
        expected = {
            "/api/area-unit": "master.api_area_unit",
            "/api/area-unit/<int:unit_id>": "master.api_area_unit_update",
            "/api/gardu-induk": "master.api_gardu_induk",
            "/api/gardu-induk/<int:gi_id>": "master.api_gardu_induk_update",
            "/api/trafo": "master.api_trafo",
            "/api/trafo/<int:trafo_id>": "master.api_trafo_update",
            "/api/penyulang": "master.api_penyulang",
            "/api/penyulang/<int:penyulang_id>": "master.api_penyulang_update",
        }

        for path, endpoint in expected.items():
            rules = [rule for rule in app.url_map.iter_rules() if rule.rule == path]
            self.assertEqual(len(rules), 1, path)
            self.assertEqual(rules[0].endpoint, endpoint)


if __name__ == "__main__":
    unittest.main()
