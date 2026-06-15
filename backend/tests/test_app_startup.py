import unittest

from flask_migrate import upgrade
from sqlalchemy import inspect

from backend.entrypoint import MIGRATIONS_DIR, app, db


class BackendStartupTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def test_testing_mode_uses_in_memory_sqlite(self):
        self.assertTrue(app.config["TESTING"])
        self.assertFalse(app.config["SECURITY_REQUIRE_LOGIN"])

        with app.app_context():
            self.assertEqual(db.engine.url.get_backend_name(), "sqlite")
            self.assertEqual(db.engine.url.database, ":memory:")

    def test_migration_creates_core_tables(self):
        with app.app_context():
            table_names = set(inspect(db.engine).get_table_names())

        self.assertIn("alembic_version", table_names)
        self.assertIn("gardu_induk", table_names)
        self.assertIn("meter_reading", table_names)
        self.assertIn("feeder_reading", table_names)

    def test_csrf_endpoint_is_available(self):
        response = self.client.get("/api/csrf-token")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(payload, dict)
        self.assertIsInstance(payload.get("csrf_token"), str)
        self.assertGreaterEqual(len(payload["csrf_token"]), 32)
        self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")

    def test_sidebar_stats_works_without_operational_database(self):
        response = self.client.get("/api/sidebar-stats")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload.get("gi_aktif"), 0)
        self.assertEqual(payload.get("alert_count"), 0)
        self.assertNotIn("error", payload)


if __name__ == "__main__":
    unittest.main()
