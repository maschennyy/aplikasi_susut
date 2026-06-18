"""CLI helpers for adopting and validating Alembic migrations."""

from __future__ import annotations

from collections import defaultdict

import click
from sqlalchemy import inspect


def _column_set(columns):
    return tuple(sorted(column.name if hasattr(column, "name") else column for column in columns))


def _column_sequence(columns):
    return tuple(column.name if hasattr(column, "name") else column for column in columns)


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
    missing_indexes = defaultdict(list)

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

        expected_indexes = {
            (index.name, _column_sequence(index.columns))
            for index in model_table.indexes
        }
        actual_indexes = {
            (item.get("name"), tuple(item.get("column_names") or []))
            for item in inspector.get_indexes(table_name)
        }
        for index_name, columns in sorted(expected_indexes - actual_indexes):
            missing_indexes[table_name].append((index_name, columns))

    return {
        "missing_tables": missing_tables,
        "extra_tables": extra_tables,
        "missing_columns": dict(missing_columns),
        "missing_uniques": dict(missing_uniques),
        "missing_foreign_keys": dict(missing_foreign_keys),
        "missing_indexes": dict(missing_indexes),
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
            "missing_indexes",
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
        for table, indexes in differences["missing_indexes"].items():
            for index_name, columns in indexes:
                click.echo(
                    f"Index tidak ditemukan pada {table}: "
                    f"{index_name} ({', '.join(columns)})"
                )

        if has_blockers:
            raise click.ClickException(
                "Skema database belum sesuai model. Jangan menjalankan db stamp sebelum masalah di atas diperbaiki."
            )

        click.echo("Schema check lulus: tabel, kolom, unique constraint, foreign key, dan index utama sesuai model.")
