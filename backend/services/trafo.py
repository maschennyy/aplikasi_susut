"""Trafo master data operations."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Mapping

from ..models import GarduInduk, Trafo, db
from .area_unit import bool_value, clean_value
from .audit_log import AuditActor, add_audit_log


class TrafoServiceError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _parse_gi_id(value: Any, *, message: str) -> GarduInduk:
    try:
        gi_id = int(value or 0)
    except (TypeError, ValueError) as exc:
        raise TrafoServiceError(message, 400) from exc

    gi = db.session.get(GarduInduk, gi_id)
    if not gi:
        raise TrafoServiceError(message, 400)
    return gi


def _decimal_value(
    value: Any,
    *,
    default: Decimal | str | int,
    field_label: str,
) -> Decimal:
    raw_value = default if value in (None, "") else value
    try:
        result = raw_value if isinstance(raw_value, Decimal) else Decimal(str(raw_value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise TrafoServiceError(f"{field_label} harus berupa angka yang valid.", 400) from exc

    if not result.is_finite():
        raise TrafoServiceError(f"{field_label} harus berupa angka yang valid.", 400)
    if result < 0:
        raise TrafoServiceError(f"{field_label} tidak boleh negatif.", 400)
    return result


def list_trafos(
    *,
    include_inactive: bool = False,
    gi_id: int | None = None,
) -> list[dict]:
    query = Trafo.query
    if not include_inactive:
        query = query.filter_by(aktif=True)
    if gi_id:
        query = query.filter_by(gi_id=gi_id)
    return [row.to_dict() for row in query.order_by(Trafo.kode_trafo).all()]


def create_trafo(payload: Mapping[str, Any], actor: AuditActor) -> dict:
    gi = _parse_gi_id(
        payload.get("gi_id"),
        message="Gardu induk wajib dipilih.",
    )
    kode = clean_value(payload.get("kode_trafo")).upper()
    nama = clean_value(payload.get("nama_trafo"))
    if not kode or not nama:
        raise TrafoServiceError("Kode trafo dan nama trafo wajib diisi.", 400)

    if Trafo.query.filter_by(gi_id=gi.id, kode_trafo=kode).first():
        raise TrafoServiceError("Kode trafo sudah ada di GI ini.", 409)

    kapasitas = _decimal_value(
        payload.get("kapasitas_mva"),
        default="0",
        field_label="Kapasitas MVA",
    )
    tegangan = _decimal_value(
        payload.get("tegangan_kv"),
        default="20",
        field_label="Tegangan kV",
    )

    try:
        trafo = Trafo(
            gi_id=gi.id,
            kode_trafo=kode,
            nama_trafo=nama,
            kapasitas_mva=kapasitas,
            tegangan_kv=tegangan,
            aktif=bool_value(payload.get("aktif", True)),
        )
        db.session.add(trafo)
        add_audit_log(
            actor=actor,
            action="CREATE_TRAFO",
            entity_type="trafo",
            detail={"kode_trafo": kode, "gi_id": gi.id},
        )
        db.session.commit()
        return trafo.to_dict()
    except Exception:
        db.session.rollback()
        raise


def update_trafo(
    trafo_id: int,
    payload: Mapping[str, Any],
    actor: AuditActor,
) -> dict:
    trafo = db.session.get(Trafo, trafo_id)
    if not trafo:
        raise TrafoServiceError("Trafo tidak ditemukan.", 404)

    gi = _parse_gi_id(
        payload.get("gi_id", trafo.gi_id),
        message="Gardu induk tidak ditemukan.",
    )
    kode = clean_value(payload.get("kode_trafo"), trafo.kode_trafo).upper()
    nama = clean_value(payload.get("nama_trafo"), trafo.nama_trafo)

    existing = Trafo.query.filter(
        Trafo.gi_id == gi.id,
        Trafo.kode_trafo == kode,
        Trafo.id != trafo.id,
    ).first()
    if existing:
        raise TrafoServiceError("Kode trafo sudah ada di GI ini.", 409)

    kapasitas = _decimal_value(
        payload.get("kapasitas_mva"),
        default=trafo.kapasitas_mva or Decimal("0"),
        field_label="Kapasitas MVA",
    )
    tegangan = _decimal_value(
        payload.get("tegangan_kv"),
        default=trafo.tegangan_kv or Decimal("20"),
        field_label="Tegangan kV",
    )

    try:
        before = trafo.to_dict()
        trafo.gi_id = gi.id
        trafo.kode_trafo = kode
        trafo.nama_trafo = nama
        trafo.kapasitas_mva = kapasitas
        trafo.tegangan_kv = tegangan
        trafo.aktif = bool_value(payload.get("aktif", trafo.aktif))
        db.session.flush()

        add_audit_log(
            actor=actor,
            action="UPDATE_TRAFO",
            entity_type="trafo",
            entity_id=trafo.id,
            detail={"before": before, "after": trafo.to_dict()},
        )
        db.session.commit()
        return trafo.to_dict()
    except Exception:
        db.session.rollback()
        raise
