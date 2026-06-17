"""Read operations for meter data."""

from typing import Any

from ..models import GarduInduk, MeterReading, Trafo, db
from .reading_filters import ReadingFilterError, parse_reading_filters


MeterDataServiceError = ReadingFilterError


def list_meter_data(
    *, gi_id: Any = None, trafo_id: Any = None, month: Any = ""
) -> list[dict]:
    filters = parse_reading_filters(
        gi_id=gi_id,
        trafo_id=trafo_id,
        month=month,
    )
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

    result = []
    for reading, trafo, gi in query.order_by(MeterReading.periode_bulan).all():
        payload = reading.to_dict()
        payload.update({
            "kode_trafo": trafo.kode_trafo,
            "nama_trafo": trafo.nama_trafo,
            "nama_gi": gi.nama_gi,
        })
        result.append(payload)
    return result
