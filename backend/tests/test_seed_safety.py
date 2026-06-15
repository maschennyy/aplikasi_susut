import unittest

from backend.seed_safety import (
    AUTOMATION_CONFIRMATION_TOKEN,
    CONFIRMATION_PHRASE,
    SeedSafetyError,
    require_seed_confirmation,
    validate_seed_target,
)


class SeedTargetValidationTest(unittest.TestCase):
    def test_rejects_production_environment(self):
        with self.assertRaisesRegex(SeedSafetyError, "APP_ENV=development"):
            validate_seed_target(
                app_env="production",
                database_url="postgresql://user:pw@localhost/app",
                allow_destructive_seed=True,
            )

    def test_rejects_missing_opt_in(self):
        with self.assertRaisesRegex(SeedSafetyError, "ALLOW_DESTRUCTIVE_SEED"):
            validate_seed_target(
                app_env="development",
                database_url="postgresql://user:pw@localhost/app",
                allow_destructive_seed=False,
            )

    def test_rejects_remote_host(self):
        with self.assertRaisesRegex(SeedSafetyError, "database lokal"):
            validate_seed_target(
                app_env="development",
                database_url="postgresql://user:pw@db.example.com/app",
                allow_destructive_seed=True,
            )

    def test_accepts_local_postgresql(self):
        target = validate_seed_target(
            app_env="development",
            database_url="postgresql://user:pw@127.0.0.1:5432/app_dev",
            allow_destructive_seed="true",
        )
        self.assertEqual(target.backend, "postgresql")
        self.assertEqual(target.host, "127.0.0.1")
        self.assertEqual(target.database, "app_dev")
        self.assertNotIn("pw", target.display_url)

    def test_accepts_sqlite_file(self):
        target = validate_seed_target(
            app_env="development",
            database_url="sqlite+pysqlite:///development.db",
            allow_destructive_seed="yes",
        )
        self.assertEqual(target.backend, "sqlite")
        self.assertEqual(target.database, "development.db")

    def test_rejects_in_memory_sqlite(self):
        with self.assertRaisesRegex(SeedSafetyError, "in-memory"):
            validate_seed_target(
                app_env="development",
                database_url="sqlite+pysqlite:///:memory:",
                allow_destructive_seed=True,
            )


class SeedConfirmationTest(unittest.TestCase):
    def setUp(self):
        self.target = validate_seed_target(
            app_env="development",
            database_url="postgresql://user:pw@localhost/app_dev",
            allow_destructive_seed=True,
        )

    def test_accepts_interactive_phrase(self):
        require_seed_confirmation(
            target=self.target,
            assume_yes=False,
            automation_token=None,
            input_fn=lambda _: CONFIRMATION_PHRASE,
        )

    def test_rejects_wrong_phrase(self):
        with self.assertRaisesRegex(SeedSafetyError, "Konfirmasi tidak cocok"):
            require_seed_confirmation(
                target=self.target,
                assume_yes=False,
                automation_token=None,
                input_fn=lambda _: "YA",
            )

    def test_yes_requires_token(self):
        with self.assertRaisesRegex(SeedSafetyError, "SEED_CONFIRMATION"):
            require_seed_confirmation(
                target=self.target,
                assume_yes=True,
                automation_token=None,
            )

    def test_yes_accepts_exact_token(self):
        require_seed_confirmation(
            target=self.target,
            assume_yes=True,
            automation_token=AUTOMATION_CONFIRMATION_TOKEN,
        )


if __name__ == "__main__":
    unittest.main()
