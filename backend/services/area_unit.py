"""Area-unit master data operations."""

from typing import Any, Mapping

from ..models import AreaUnit, db
from .audit_log import AuditActor, add_audit_log


class AreaUnitServiceError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def clean_value(value: Any, default: str = "") -> str:
    text = str(value or "").strip()
    return text if text else default


def bool_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on", "aktif"}


def list_area_units(include_inactive: bool = False) -> list[dict]:
    query = AreaUnit.query
    if not include_inactive:
        query = query.filter_by(aktif=True)
    return [
        row.to_dict()
        for row in query.order_by(AreaUnit.jenis, AreaUnit.nama_unit).all()
    ]


def create_area_unit(payload: Mapping[str, Any], actor: AuditActor) -> dict:
    kode = clean_value(payload.get("kode_unit")).upper()
    nama = clean_value(payload.get("nama_unit"))
    if not kode or not nama:
        raise AreaUnitServiceError("Kode unit dan nama unit wajib diisi.", 400)
    if AreaUnit.query.filter_by(kode_unit=kode).first():
        raise AreaUnitServiceError("Kode unit sudah terdaftar.", 409)

    try:
        unit = AreaUnit(
            kode_unit=kode,
            nama_unit=nama,
            jenis=clean_value(payload.get("jenis"), "UP3").upper(),
            parent_unit=clean_value(payload.get("parent_unit")) or None,
            aktif=bool_value(payload.get("aktif", True)),
        )
        db.session.add(unit)
        add_audit_log(
            actor=actor,
            action="CREATE_AREA_UNIT",
            entity_type="area_unit",
            detail={"kode_unit": kode},
        )
        db.session.commit()
        return unit.to_dict()
    except Exception:
        db.session.rollback()
        raise


def update_area_unit(unit_id: int, payload: Mapping[str, Any], actor: AuditActor) -> dict:
    unit = db.session.get(AreaUnit, unit_id)
    if not unit:
        raise AreaUnitServiceError("Area/unit tidak ditemukan.", 404)

    kode = clean_value(payload.get("kode_unit"), unit.kode_unit).upper()
    nama = clean_value(payload.get("nama_unit"), unit.nama_unit)
    existing = AreaUnit.query.filter(
        AreaUnit.kode_unit == kode,
        AreaUnit.id != unit.id,
    ).first()
    if existing:
        raise AreaUnitServiceError("Kode unit sudah dipakai area/unit lain.", 409)

    try:
        before = unit.to_dict()
        unit.kode_unit = kode
        unit.nama_unit = nama
        unit.jenis = clean_value(payload.get("jenis"), unit.jenis).upper()
        unit.parent_unit = clean_value(payload.get("parent_unit")) or None
        unit.aktif = bool_value(payload.get("aktif", unit.aktif))
        add_audit_log(
            actor=actor,
            action="UPDATE_AREA_UNIT",
            entity_type="area_unit",
            entity_id=unit.id,
            detail={"before": before, "after": unit.to_dict()},
        )
        db.session.commit()
        return unit.to_dict()
    except Exception:
        db.session.rollback()
        raise
