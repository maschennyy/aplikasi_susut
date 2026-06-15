from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def update_requirements() -> None:
    path = ROOT / "backend/requirements.txt"
    lines = path.read_text(encoding="utf-8").splitlines()
    if not any(line.startswith("Flask-Migrate==") for line in lines):
        lines.append("Flask-Migrate==4.1.0")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def update_app() -> None:
    path = ROOT / "backend/app.py"
    source = path.read_text(encoding="utf-8")

    flask_import = "from flask import Flask, Response, abort, g, jsonify, request, send_file, session\n"
    if "from flask_migrate import Migrate\n" not in source:
        source = source.replace(flask_import, flask_import + "from flask_migrate import Migrate\n", 1)
    if "from pathlib import Path\n" not in source:
        source = source.replace("from functools import wraps\n", "from functools import wraps\nfrom pathlib import Path\n", 1)

    db_marker = "db.init_app(app)"
    bootstrap_marker = "\nwith app.app_context():"
    security_marker = "\n\n# ════════════════════════════════════════════════\n# KONFIGURASI SECURITY, ROLE, DAN WORKFLOW"
    db_end = source.index(db_marker) + len(db_marker)
    bootstrap_start = source.index(bootstrap_marker, db_end)
    bootstrap_end = source.index(security_marker, bootstrap_start)
    migration_setup = (
        "\nMIGRATIONS_DIR = Path(__file__).resolve().parent / 'migrations'\n"
        "migrate = Migrate(\n"
        "    app,\n"
        "    db,\n"
        "    directory=str(MIGRATIONS_DIR),\n"
        "    compare_type=True,\n"
        "    render_as_batch=True,\n"
        ")"
    )
    source = source[:db_end] + migration_setup + source[bootstrap_end:]
    path.write_text(source, encoding="utf-8")


def write_migration_tools() -> None:
    content = '''"""CLI helpers for adopting and validating Alembic migrations."""

from __future__ import annotations

from collections import defaultdict

import click
from sqlalchemy import inspect


def _column_set(columns):
    return tuple(sorted(column.name if hasattr(column, "name") else column for column in columns))


def schema_differences(db):
    """Compare required model structures with the connected database."""
    inspector = inspect(db.engine)
    actual_tables = set(inspector.get_table_names())
    expected_tables = set(db.metadata.tables)

    missing_tables = sorted(expected_tables - actual_tables)
    extra_tables = sorted(actual_tables - expected_tables - {"alembic_version"})
    missing_columns = defaultdict(list)
    missing_uniques = defaultdict(list)
    missing_foreign_keys = defaultdict(list)

    for table_name in sorted(expected_tables & actual_tables):
        model_table = db.metadata.tables[table_name]
        actual_columns = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name in sorted(set(model_table.columns.keys()) - actual_columns):
            missing_columns[table_name].append(column_name)

        expected_unique = {
            _column_set(constraint.columns)
            for constraint in model_table.constraints
            if constraint.__class__.__name__ == "UniqueConstraint"
        }
        actual_unique = {
            tuple(sorted(item.get("column_names") or []))
            for item in inspector.get_unique_constraints(table_name)
        }
        for columns in sorted(expected_unique - actual_unique):
            missing_uniques[table_name].append(columns)

        expected_fks = {
            (
                tuple(sorted(fk.parent.name for fk in constraint.elements)),
                constraint.elements[0].column.table.name,
                tuple(sorted(fk.column.name for fk in constraint.elements)),
            )
            for constraint in model_table.foreign_key_constraints
        }
        actual_fks = {
            (
                tuple(sorted(item.get("constrained_columns") or [])),
                item.get("referred_table"),
                tuple(sorted(item.get("referred_columns") or [])),
            )
            for item in inspector.get_foreign_keys(table_name)
        }
        for foreign_key in sorted(expected_fks - actual_fks):
            missing_foreign_keys[table_name].append(foreign_key)

    return {
        "missing_tables": missing_tables,
        "extra_tables": extra_tables,
        "missing_columns": dict(missing_columns),
        "missing_uniques": dict(missing_uniques),
        "missing_foreign_keys": dict(missing_foreign_keys),
    }


def register_migration_commands(app, db):
    @app.cli.command("schema-check")
    def schema_check_command():
        """Validate an existing schema before stamping Alembic head."""
        differences = schema_differences(db)
        blocking_keys = (
            "missing_tables",
            "missing_columns",
            "missing_uniques",
            "missing_foreign_keys",
        )
        has_blockers = any(differences[key] for key in blocking_keys)

        if differences["extra_tables"]:
            click.echo("Tabel tambahan (tidak menghalangi stamp):")
            for table in differences["extra_tables"]:
                click.echo(f"  - {table}")

        for table in differences["missing_tables"]:
            click.echo(f"Tabel tidak ditemukan: {table}")
        for table, columns in differences["missing_columns"].items():
            click.echo(f"Kolom tidak ditemukan pada {table}: {', '.join(columns)}")
        for table, constraints in differences["missing_uniques"].items():
            for columns in constraints:
                click.echo(f"Unique constraint tidak ditemukan pada {table}: {', '.join(columns)}")
        for table, constraints in differences["missing_foreign_keys"].items():
            for local_columns, remote_table, remote_columns in constraints:
                click.echo(
                    f"Foreign key tidak ditemukan pada {table}: "
                    f"{', '.join(local_columns)} -> {remote_table}({', '.join(remote_columns)})"
                )

        if has_blockers:
            raise click.ClickException(
                "Skema database belum sesuai model. Jangan menjalankan db stamp sebelum masalah di atas diperbaiki."
            )

        click.echo("Schema check lulus: tabel, kolom, unique constraint, dan foreign key utama sesuai model.")
'''
    (ROOT / "backend/migration_tools.py").write_text(content, encoding="utf-8")


def update_entrypoint() -> None:
    path = ROOT / "backend/entrypoint.py"
    source = path.read_text(encoding="utf-8")
    source = source.replace(
        "    TransferAntarUnit,\n)",
        "    TransferAntarUnit,\n    migrate,\n    MIGRATIONS_DIR,\n)",
        1,
    )
    registration = "\nfrom .migration_tools import register_migration_commands\n\nregister_migration_commands(app, db)\n"
    if "register_migration_commands(app, db)" not in source:
        source = source.replace("\n\n__all__ = [", registration + "\n__all__ = [", 1)
    source = source.replace(
        '    "TransferAntarUnit",\n]',
        '    "TransferAntarUnit",\n    "migrate",\n    "MIGRATIONS_DIR",\n]',
        1,
    )
    path.write_text(source, encoding="utf-8")


def write_tests() -> None:
    startup = '''import unittest

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
'''
    (ROOT / "backend/tests/test_app_startup.py").write_text(startup, encoding="utf-8")

    schema_test = '''import unittest

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
'''
    (ROOT / "backend/tests/test_migration_tools.py").write_text(schema_test, encoding="utf-8")


def update_package() -> None:
    path = ROOT / "package.json"
    package = json.loads(path.read_text(encoding="utf-8"))
    scripts = package.setdefault("scripts", {})
    scripts["backend:db:upgrade"] = "python -m flask --app backend.entrypoint db upgrade"
    scripts["backend:db:check"] = "python -m flask --app backend.entrypoint schema-check"
    scripts["backend:admin"] = "python -m flask --app backend.entrypoint create-admin"
    path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def update_readme() -> None:
    path = ROOT / "README.md"
    source = path.read_text(encoding="utf-8")
    if "## Migrasi Database" in source:
        return
    source += '''

## Migrasi Database

Perubahan skema dikelola dengan Flask-Migrate/Alembic. Startup aplikasi tidak lagi menjalankan `db.create_all()` atau `ALTER TABLE` otomatis.

### Database baru

```bash
npm run backend:db:upgrade
npm run backend:admin
```

Perintah pertama membuat seluruh tabel sampai revision terbaru. Perintah kedua membuat akun admin secara interaktif.

### Database lama yang sudah berisi data

1. Buat backup database.
2. Pastikan kode aplikasi sesuai dengan skema yang sedang digunakan.
3. Jalankan pemeriksaan:

```bash
npm run backend:db:check
```

4. Hanya ketika pemeriksaan lulus, tandai database existing sebagai baseline:

```bash
python -m flask --app backend.entrypoint db stamp head
```

5. Jalankan upgrade untuk revision berikutnya:

```bash
npm run backend:db:upgrade
```

`db stamp` tidak membuat atau mengubah tabel. Perintah tersebut hanya mencatat revision Alembic, sehingga tidak boleh dijalankan sebelum backup dan `schema-check` lulus.

### Membuat revision baru

Setelah mengubah `backend/models.py`:

```bash
python -m flask --app backend.entrypoint db migrate -m "jelaskan perubahan"
python -m flask --app backend.entrypoint db upgrade
```

Selalu tinjau file revision yang dihasilkan sebelum menjalankan upgrade pada database operasional.
'''
    path.write_text(source, encoding="utf-8")


def main() -> None:
    update_requirements()
    update_app()
    write_migration_tools()
    update_entrypoint()
    write_tests()
    update_package()
    update_readme()


if __name__ == "__main__":
    main()
