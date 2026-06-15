import unittest

from backend.entrypoint import app, db
from backend.migration_tools import schema_differences


class MigrationSchemaCheckTest(unittest.TestCase):
    def test_migrated_schema_matches_model_metadata(self):
        with app.app_context():
            differences = schema_differences(db)

        self.assertEqual(differences["missing_tables"], [])
        self.assertEqual(differences["missing_columns"], {})
        self.assertEqual(differences["missing_uniques"], {})
        self.assertEqual(differences["missing_foreign_keys"], {})


if __name__ == "__main__":
    unittest.main()
