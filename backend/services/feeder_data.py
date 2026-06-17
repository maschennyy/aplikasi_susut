"""Read operations for feeder meter data."""

from __future__ import annotations

from typing import Any

from ..models import FeederReading, Penyulang, db
from .reading_filters import ReadingFilterError, parse_reading_filters


FeederDataServiceError = ReadingFilterError


def list_feeder_data(
    *,
    gi_id: Any = None,
    trafo_id: Any = None,
    month: Any = "",
) -> list[dict]:
    """Return feeder readings enriched with Penyulang master fields."""
    filters = parse_reading_filters(
        gi_id=gi_id,
        trafo_id=trafo_id,
        month=month,
    )

    query = db.session.query(FeederReading, Penyulang).join(
        Penyulang,
        FeederReading.penyulang_id == Penyulang.id,
    )
    if filters.gi_id is not None:
        query = query.filter(FeederReading.gi_id == filters.gi_id)
    if filters.trafo_id is not None:
        query = query.filter(FeederReading.trafo_id == filters.trafo_id)
    if filters.period_start is not None and filters.period_end is not None:
        query = query.filter(
            FeederReading.periode_bulan >= filters.period_start,
            FeederReading.periode_bulan < filters.period_end,
        )

    rows = []
    for reading, feeder in query.order_by(Penyulang.kode_penyulang).all():
        payload = reading.to_dict()
        payload.update({
            "kode_penyulang": feeder.kode_penyulang,
            "nama_penyulang": feeder.nama_penyulang,
            "jenis": feeder.jenis,
            "area_up3": feeder.area_up3,
            "ex_cabang": feeder.ex_cabang,
            "status": feeder.status or (
                "AKTIF" if feeder.aktif else "NONAKTIF"
            ),
        })
        rows.append(payload)
    return rows
