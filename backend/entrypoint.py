"""Package-safe entry point for the Flask backend.

Run this module from the repository root with ``python -m backend.entrypoint``
or expose ``backend.entrypoint:app`` through Gunicorn.
"""

from __future__ import annotations

import os

from .app import (
    app,
    db,
    GarduInduk,
    Trafo,
    Penyulang,
    MeterReading,
    FeederReading,
    TransferAntarUnit,
    migrate,
    MIGRATIONS_DIR,
)
from .migration_tools import register_migration_commands
from .route_compat import normalize_migrated_routes


normalize_migrated_routes(
    app,
    "api_area_unit",
    "api_area_unit_update",
    "api_gardu_induk",
    "api_gardu_induk_update",
    "api_trafo",
    "api_trafo_update",
    "api_penyulang_list",
    "api_penyulang_update",
)
register_migration_commands(app, db)


__all__ = [
    "app",
    "db",
    "GarduInduk",
    "Trafo",
    "Penyulang",
    "MeterReading",
    "FeederReading",
    "TransferAntarUnit",
    "migrate",
    "MIGRATIONS_DIR",
]


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode, host="0.0.0.0", port=5000)
