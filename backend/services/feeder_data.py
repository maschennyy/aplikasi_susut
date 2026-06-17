"""Read operations for feeder meter data."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from ..models import FeederReading, GarduInduk, Penyulang, Trafo, db


_PERIOD_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")


class FeederDataServiceError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _parse_optional_positive_id(value: Any, *, label: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise FeederDataServiceError(
            f"Filter {label} harus berupa ID positif.",
            400,
        ) from exc
    if parsed <= 0:
        raise FeederDataServiceError(
            f"Filter {label} harus berupa ID positif.",
            400,
        )
    return parsed


def _next_month(period: date) -> date:
    if period.month == 12:
        return date(period.year + 1, 1, 1)
    return date(period.year, period.month + 1, 1)


def _parse_period(value: Any) -> tuple[date, date] | None:
    raw = str(value or "").strip()
    if not raw:
        return None

    match = _PERIOD_PATTERN.fullmatch(raw)
    if not match:
        raise FeederDataServiceError("Format bulan harus YYYY-MM.", 400)

    year = int(match.group(1))
    month = int(match.group(2))
    if year < 2000 or year > 2100:
        raise FeederDataServiceError(
            "Tahun periode harus antara 2000 dan 2100.",
            400,
        )
    if month < 1 or month > 12:
        raise FeederDataServiceError("Format bulan harus YYYY-MM.", 400)

    period = date(year, month, 1)
    return period, _next_month(period)


def _validate_master_filters(
    *,
    gi_id: int | None,
    trafo_id: int | None,
) -> None:
    gi = None
    if gi_id is not None:
        gi = db.session.get(GarduInduk, gi_id)
        if gi is None:
            raise FeederDataServiceError(
                "Gardu induk tidak ditemukan.",
                404,
            )

    if trafo_id is not None:
        trafo = db.session.get(Trafo, trafo_id)
        if trafo is None:
            raise FeederDataServiceError("Trafo tidak ditemukan.", 404)
        if gi is not None and trafo.gi_id != gi.id:
            raise FeederDataServiceError(
                "Trafo tidak berada pada Gardu Induk yang dipilih.",
                400,
            )


def list_feeder_data(
    *,
    gi_id: Any = None,
    trafo_id: Any = None,
    month: Any = "",
) -> list[dict]:
    """Return feeder readings enriched with Penyulang master fields."""
    parsed_gi_id = _parse_optional_positive_id(gi_id, label="GI")
    parsed_trafo_id = _parse_optional_positive_id(trafo_id, label="Trafo")
    period_bounds = _parse_period(month)
    _validate_master_filters(
        gi_id=parsed_gi_id,
        trafo_id=parsed_trafo_id,
    )

    query = db.session.query(FeederReading, Penyulang).join(
        Penyulang,
        FeederReading.penyulang_id == Penyulang.id,
    )
    if parsed_gi_id is not None:
        query = query.filter(FeederReading.gi_id == parsed_gi_id)
    if parsed_trafo_id is not None:
        query = query.filter(FeederReading.trafo_id == parsed_trafo_id)
    if period_bounds is not None:
        start, end = period_bounds
        query = query.filter(
            FeederReading.periode_bulan >= start,
            FeederReading.periode_bulan < end,
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
