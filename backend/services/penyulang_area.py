"""Read-only lookup operations for Penyulang master data."""

from __future__ import annotations

from ..models import Penyulang, db


def list_active_penyulang_areas() -> list[str]:
    """Return distinct non-empty UP3 areas from active Penyulang records."""
    rows = (
        db.session.query(Penyulang.area_up3)
        .filter(Penyulang.aktif.is_(True))
        .filter(Penyulang.area_up3.isnot(None))
        .filter(Penyulang.area_up3 != "")
        .distinct()
        .order_by(Penyulang.area_up3)
        .all()
    )
    return [row[0] for row in rows]
