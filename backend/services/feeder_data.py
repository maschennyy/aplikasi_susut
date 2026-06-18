"""Read operations for feeder meter data."""

from __future__ import annotations

from typing import Any

from ..models import FeederReading, Penyulang, db
from .reading_filters import ReadingFilterError, parse_pagination, parse_reading_filters


FeederDataServiceError = ReadingFilterError


def list_feeder_data(
    *,
    gi_id: Any = None,
    trafo_id: Any = None,
    penyulang_id: Any = None,
    month: Any = "",
    page: Any = None,
    page_size: Any = None,
) -> dict:
    """Return feeder readings enriched with Penyulang master fields."""
    filters = parse_reading_filters(
        gi_id=gi_id,
        trafo_id=trafo_id,
        penyulang_id=penyulang_id,
        month=month,
    )
    pagination_params = parse_pagination(page=page, page_size=page_size)

    query = db.session.query(FeederReading, Penyulang).join(
        Penyulang,
        FeederReading.penyulang_id == Penyulang.id,
    )
    if filters.gi_id is not None:
        query = query.filter(FeederReading.gi_id == filters.gi_id)
    if filters.trafo_id is not None:
        query = query.filter(FeederReading.trafo_id == filters.trafo_id)
    if filters.penyulang_id is not None:
        query = query.filter(FeederReading.penyulang_id == filters.penyulang_id)
    if filters.period_start is not None and filters.period_end is not None:
        query = query.filter(
            FeederReading.periode_bulan >= filters.period_start,
            FeederReading.periode_bulan < filters.period_end,
        )

    pagination = query.order_by(Penyulang.kode_penyulang, FeederReading.id).paginate(
        page=pagination_params.page,
        per_page=pagination_params.page_size,
        error_out=False,
    )
    rows = []
    for reading, feeder in pagination.items:
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
    return {
        "rows": rows,
        "total": pagination.total,
        "page": pagination.page,
        "page_size": pagination.per_page,
        "pages": pagination.pages,
        "has_next": pagination.has_next,
        "has_prev": pagination.has_prev,
    }
