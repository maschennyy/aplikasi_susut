"""Read-only summary calculations for master data."""

from __future__ import annotations

from ..models import AreaUnit, GarduInduk, Penyulang, Trafo


def get_master_data_summary() -> dict[str, int]:
    """Return active master-data counts and mapping gaps."""
    return {
        "gi": GarduInduk.query.filter_by(aktif=True).count(),
        "trafo": Trafo.query.filter_by(aktif=True).count(),
        "penyulang": Penyulang.query.filter_by(aktif=True).count(),
        "area_unit": AreaUnit.query.filter_by(aktif=True).count(),
        "missing_area": Penyulang.query.filter(
            Penyulang.aktif.is_(True),
            (Penyulang.area_up3.is_(None)) | (Penyulang.area_up3 == ""),
        ).count(),
        "trafo_without_feeder": Trafo.query.filter(
            Trafo.aktif.is_(True),
            ~Trafo.penyulangs.any(),
        ).count(),
    }
