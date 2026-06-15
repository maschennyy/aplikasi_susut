"""Package-safe entry point for the Flask backend.

The current monolithic app still resolves its local modules from the backend
folder. This entry point makes that execution mode explicit and re-exports the
same SQLAlchemy registry used by the Flask application.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from .app import (
    app,
    db,
    GarduInduk,
    Trafo,
    Penyulang,
    MeterReading,
    FeederReading,
    TransferAntarUnit,
)


__all__ = [
    "app",
    "db",
    "GarduInduk",
    "Trafo",
    "Penyulang",
    "MeterReading",
    "FeederReading",
    "TransferAntarUnit",
]


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode, host="0.0.0.0", port=5000)
