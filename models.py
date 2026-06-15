"""Compatibility bridge for the legacy import inside ``backend.app``.

All objects are re-exported from ``backend.models`` so Flask, seed commands,
and package imports share one SQLAlchemy registry.
"""

from backend.models import (
    db,
    User,
    AuditLog,
    AreaUnit,
    MonthlyDataStatus,
    GarduInduk,
    Trafo,
    Penyulang,
    MeterReading,
    FeederReading,
    TransferAntarUnit,
    EximRule,
    EximMonthlyResult,
    KwhJual,
    RekapBulanan,
)

__all__ = [
    "db",
    "User",
    "AuditLog",
    "AreaUnit",
    "MonthlyDataStatus",
    "GarduInduk",
    "Trafo",
    "Penyulang",
    "MeterReading",
    "FeederReading",
    "TransferAntarUnit",
    "EximRule",
    "EximMonthlyResult",
    "KwhJual",
    "RekapBulanan",
]
