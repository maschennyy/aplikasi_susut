"""Shared filter parsing and validation for reading endpoints."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from ..models import GarduInduk, Trafo, db


_PERIOD_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")


class ReadingFilterError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class ReadingFilters:
    gi_id: int | None
    trafo_id: int | None
    period_start: date | None
    period_end: date | None


@dataclass(frozen=True)
class PaginationParams:
    page: int
    page_size: int


def parse_optional_positive_id(value: Any, *, label: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise ReadingFilterError(
            f"Filter {label} harus berupa ID positif.",
            400,
        ) from exc
    if parsed <= 0:
        raise ReadingFilterError(
            f"Filter {label} harus berupa ID positif.",
            400,
        )
    return parsed


def parse_positive_int(value: Any, *, label: str, default: int) -> int:
    if value in (None, ""):
        return default
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise ReadingFilterError(f"{label} harus berupa angka positif.", 400) from exc
    if parsed <= 0:
        raise ReadingFilterError(f"{label} harus berupa angka positif.", 400)
    return parsed


def parse_pagination(
    *,
    page: Any = None,
    page_size: Any = None,
    default_page: int = 1,
    default_page_size: int = 100,
    max_page_size: int = 500,
) -> PaginationParams:
    parsed_page = parse_positive_int(page, label="Page", default=default_page)
    parsed_page_size = parse_positive_int(
        page_size,
        label="Page size",
        default=default_page_size,
    )
    return PaginationParams(
        page=parsed_page,
        page_size=min(parsed_page_size, max_page_size),
    )


def _next_month(period: date) -> date:
    if period.month == 12:
        return date(period.year + 1, 1, 1)
    return date(period.year, period.month + 1, 1)


def parse_month_bounds(value: Any) -> tuple[date, date] | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    match = _PERIOD_PATTERN.fullmatch(raw)
    if not match:
        raise ReadingFilterError("Format bulan harus YYYY-MM.", 400)
    year = int(match.group(1))
    month = int(match.group(2))
    if year < 2000 or year > 2100:
        raise ReadingFilterError(
            "Tahun periode harus antara 2000 dan 2100.",
            400,
        )
    if month < 1 or month > 12:
        raise ReadingFilterError("Format bulan harus YYYY-MM.", 400)
    period = date(year, month, 1)
    return period, _next_month(period)


def validate_gi_trafo_filters(*, gi_id: int | None, trafo_id: int | None) -> None:
    gi = None
    if gi_id is not None:
        gi = db.session.get(GarduInduk, gi_id)
        if gi is None:
            raise ReadingFilterError("Gardu induk tidak ditemukan.", 404)
    if trafo_id is not None:
        trafo = db.session.get(Trafo, trafo_id)
        if trafo is None:
            raise ReadingFilterError("Trafo tidak ditemukan.", 404)
        if gi is not None and trafo.gi_id != gi.id:
            raise ReadingFilterError(
                "Trafo tidak berada pada Gardu Induk yang dipilih.",
                400,
            )


def parse_reading_filters(
    *,
    gi_id: Any = None,
    trafo_id: Any = None,
    month: Any = "",
) -> ReadingFilters:
    parsed_gi_id = parse_optional_positive_id(gi_id, label="GI")
    parsed_trafo_id = parse_optional_positive_id(trafo_id, label="Trafo")
    period_bounds = parse_month_bounds(month)
    validate_gi_trafo_filters(
        gi_id=parsed_gi_id,
        trafo_id=parsed_trafo_id,
    )
    return ReadingFilters(
        gi_id=parsed_gi_id,
        trafo_id=parsed_trafo_id,
        period_start=period_bounds[0] if period_bounds else None,
        period_end=period_bounds[1] if period_bounds else None,
    )
