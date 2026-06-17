"""Business logic for kWh sales by customer tariff class."""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping, Sequence

from ..catalogs.customer_classes import (
    KWH_JUAL_CATALOG,
    KWH_JUAL_GROUP_LABELS,
    catalog_payload,
    find_customer_class,
)
from ..models import GarduInduk, KwhJual, db
from .audit_log import AuditActor, add_audit_log


class KwhJualServiceError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def normalize_period(value: Any) -> date:
    """Normalize common month/date inputs to the first day of the month."""
    if value is None or str(value).strip() == "":
        raise KwhJualServiceError("Kolom bulan/periode wajib diisi.", 400)

    if isinstance(value, datetime):
        return date(value.year, value.month, 1)
    if isinstance(value, date):
        return date(value.year, value.month, 1)

    raw = str(value).strip()
    if len(raw) == 7 and raw[4] == "-":
        try:
            return date(int(raw[:4]), int(raw[5:7]), 1)
        except ValueError:
            pass

    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%Y"):
        try:
            parsed = datetime.strptime(raw, fmt)
            return date(parsed.year, parsed.month, 1)
        except ValueError:
            continue

    raise KwhJualServiceError(f"Format bulan tidak dikenali: {raw}", 400)


def _shift_month(period: date, offset: int) -> date:
    month_index = period.year * 12 + period.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def _next_month(period: date) -> date:
    return _shift_month(period, 1)


def _to_decimal(value: Any, sub_golongan: str) -> Decimal:
    try:
        result = Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        raise KwhJualServiceError(
            f"Nilai kWh tidak valid: {sub_golongan}",
            400,
        )

    if not result.is_finite():
        raise KwhJualServiceError(
            f"Nilai kWh tidak valid: {sub_golongan}",
            400,
        )
    if result < 0:
        raise KwhJualServiceError(
            f"Nilai kWh tidak boleh negatif: {sub_golongan}",
            400,
        )
    return result


def get_kwh_jual(gi_id: int | None, period: date) -> dict:
    query = KwhJual.query.filter(KwhJual.periode_bulan == period)
    if gi_id:
        query = query.filter(KwhJual.gi_id == gi_id)

    values_by_sub = defaultdict(float)
    known_sub_groups = {item["sub_golongan"] for item in KWH_JUAL_CATALOG}
    for row in query.all():
        if row.sub_golongan in known_sub_groups:
            values_by_sub[row.sub_golongan] += float(row.kwh or 0)

    per_group = {key: 0.0 for key in KWH_JUAL_GROUP_LABELS}
    per_voltage = {"TR": 0.0, "TM": 0.0, "TT": 0.0}
    detail = []

    for item in KWH_JUAL_CATALOG:
        kwh = values_by_sub.get(item["sub_golongan"], 0.0)
        per_group[item["group"]] += kwh
        per_voltage[item["tegangan"]] += kwh
        detail.append({
            "group": item["group"],
            "group_label": KWH_JUAL_GROUP_LABELS[item["group"]],
            "golongan": item["golongan"],
            "sub_golongan": item["sub_golongan"],
            "tegangan": item["tegangan"],
            "kwh": round(kwh, 3),
        })

    return {
        "periode": period.strftime("%Y-%m"),
        "periode_bulan": period.strftime("%Y-%m-%d"),
        "gi_id": gi_id,
        "catalog": catalog_payload(),
        "detail": detail,
        "per_golongan": {
            key: round(value, 3)
            for key, value in per_group.items()
        },
        "per_tegangan": {
            key: round(value, 3)
            for key, value in per_voltage.items()
        },
        "total": round(sum(per_voltage.values()), 3),
        "trend": get_kwh_jual_trend(gi_id, period),
    }


def get_kwh_jual_trend(gi_id: int | None, period: date) -> list[dict]:
    start = _shift_month(period, -5)
    end = _next_month(period)
    query = KwhJual.query.filter(
        KwhJual.periode_bulan >= start,
        KwhJual.periode_bulan < end,
    )
    if gi_id:
        query = query.filter(KwhJual.gi_id == gi_id)

    monthly = {
        _shift_month(start, index).strftime("%Y-%m"): {
            "total": 0.0,
            "TR": 0.0,
            "TM": 0.0,
            "TT": 0.0,
        }
        for index in range(6)
    }

    for row in query.all():
        key = row.periode_bulan.strftime("%Y-%m")
        if key not in monthly:
            continue

        value = float(row.kwh or 0)
        monthly[key]["total"] += value
        if row.tegangan in {"TR", "TM", "TT"}:
            monthly[key][row.tegangan] += value

    return [
        {
            "periode": key,
            **{
                name: round(value, 3)
                for name, value in values.items()
            },
        }
        for key, values in monthly.items()
    ]


def upsert_kwh_jual(
    *,
    gi_id: int,
    period: date,
    entries: Sequence[Mapping[str, Any]],
    actor: AuditActor,
) -> dict:
    gi = db.session.get(GarduInduk, gi_id)
    if not gi:
        raise KwhJualServiceError("Gardu induk wajib dipilih.", 400)
    if not isinstance(entries, list):
        raise KwhJualServiceError("Format entries tidak valid.", 400)

    try:
        saved = 0
        total = Decimal("0")

        for item in entries:
            if not isinstance(item, Mapping):
                raise KwhJualServiceError(
                    "Setiap entries harus berupa objek.",
                    400,
                )

            sub_group = str(item.get("sub_golongan") or "").strip()
            catalog = find_customer_class(sub_group)
            if not catalog:
                raise KwhJualServiceError(
                    f"Sub-golongan tidak dikenali: {sub_group}",
                    400,
                )

            kwh = _to_decimal(item.get("kwh"), sub_group)
            row = KwhJual.query.filter_by(
                gi_id=gi.id,
                periode_bulan=period,
                sub_golongan=sub_group,
            ).first()

            if not row:
                row = KwhJual(
                    gi_id=gi.id,
                    periode_bulan=period,
                    sub_golongan=sub_group,
                )
                db.session.add(row)

            row.golongan = catalog["golongan"]
            row.tegangan = catalog["tegangan"]
            row.kwh = kwh
            saved += 1
            total += kwh

        add_audit_log(
            actor=actor,
            action="UPSERT_KWH_JUAL",
            entity_type="kwh_jual",
            entity_id=f"{gi.id}:{period:%Y-%m}",
            detail={
                "gi_id": gi.id,
                "kode_gi": gi.kode_gi,
                "periode_bulan": period.strftime("%Y-%m-%d"),
                "rows": saved,
                "total_kwh": float(total),
            },
        )
        db.session.commit()
        return get_kwh_jual(gi.id, period)
    except Exception:
        db.session.rollback()
        raise
