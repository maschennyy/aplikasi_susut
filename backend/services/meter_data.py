"""Read operations for meter data."""

from typing import Any

from ..models import GarduInduk, MeterReading, Trafo, db
from .reading_filters import ReadingFilterError, parse_pagination, parse_reading_filters


MeterDataServiceError = ReadingFilterError


def list_meter_data(
    *,
    gi_id: Any = None,
    trafo_id: Any = None,
    month: Any = "",
    page: Any = None,
    page_size: Any = None,
) -> dict:
    filters = parse_reading_filters(
        gi_id=gi_id,
        trafo_id=trafo_id,
        month=month,
    )
    pagination_params = parse_pagination(page=page, page_size=page_size)
    query = (
        db.session.query(MeterReading, Trafo, GarduInduk)
        .join(Trafo, MeterReading.trafo_id == Trafo.id)
        .join(GarduInduk, MeterReading.gi_id == GarduInduk.id)
    )
    if filters.gi_id is not None:
        query = query.filter(MeterReading.gi_id == filters.gi_id)
    if filters.trafo_id is not None:
        query = query.filter(MeterReading.trafo_id == filters.trafo_id)
    if filters.period_start is not None:
        query = query.filter(
            MeterReading.periode_bulan >= filters.period_start,
            MeterReading.periode_bulan < filters.period_end,
        )

    pagination = query.order_by(MeterReading.periode_bulan, MeterReading.id).paginate(
        page=pagination_params.page,
        per_page=pagination_params.page_size,
        error_out=False,
    )
    result = []
    for reading, trafo, gi in pagination.items:
        payload = reading.to_dict()
        payload.update({
            "kode_trafo": trafo.kode_trafo,
            "nama_trafo": trafo.nama_trafo,
            "nama_gi": gi.nama_gi,
        })
        result.append(payload)
    return {
        "rows": result,
        "total": pagination.total,
        "page": pagination.page,
        "page_size": pagination.per_page,
        "pages": pagination.pages,
        "has_next": pagination.has_next,
        "has_prev": pagination.has_prev,
    }
