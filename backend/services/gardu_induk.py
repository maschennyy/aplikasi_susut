"""Gardu induk master data operations."""

from typing import Any, Mapping

from ..models import GarduInduk, db
from .area_unit import bool_value, clean_value
from .audit_log import AuditActor, add_audit_log


class GarduIndukServiceError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def list_gardu_induk(include_inactive: bool = False) -> list[dict]:
    query = GarduInduk.query
    if not include_inactive:
        query = query.filter_by(aktif=True)
    return [row.to_dict() for row in query.order_by(GarduInduk.nama_gi).all()]


def create_gardu_induk(payload: Mapping[str, Any], actor: AuditActor) -> dict:
    kode = clean_value(payload.get("kode_gi")).upper()
    nama = clean_value(payload.get("nama_gi"))
    if not kode or not nama:
        raise GarduIndukServiceError("Kode GI dan nama GI wajib diisi.", 400)
    if GarduInduk.query.filter_by(kode_gi=kode).first():
        raise GarduIndukServiceError("Kode GI sudah terdaftar.", 409)

    try:
        gi = GarduInduk(
            kode_gi=kode,
            nama_gi=nama,
            area=clean_value(payload.get("area")) or None,
            unit=clean_value(payload.get("unit")) or None,
            alamat=clean_value(payload.get("alamat")) or None,
            aktif=bool_value(payload.get("aktif", True)),
        )
        db.session.add(gi)
        add_audit_log(
            actor=actor,
            action="CREATE_GI",
            entity_type="gardu_induk",
            detail={"kode_gi": kode},
        )
        db.session.commit()
        return gi.to_dict()
    except Exception:
        db.session.rollback()
        raise


def update_gardu_induk(gi_id: int, payload: Mapping[str, Any], actor: AuditActor) -> dict:
    gi = db.session.get(GarduInduk, gi_id)
    if not gi:
        raise GarduIndukServiceError("Gardu induk tidak ditemukan.", 404)

    kode = clean_value(payload.get("kode_gi"), gi.kode_gi).upper()
    nama = clean_value(payload.get("nama_gi"), gi.nama_gi)
    existing = GarduInduk.query.filter(
        GarduInduk.kode_gi == kode,
        GarduInduk.id != gi.id,
    ).first()
    if existing:
        raise GarduIndukServiceError("Kode GI sudah dipakai gardu induk lain.", 409)

    try:
        before = gi.to_dict()
        gi.kode_gi = kode
        gi.nama_gi = nama
        gi.area = clean_value(payload.get("area")) or None
        gi.unit = clean_value(payload.get("unit")) or None
        gi.alamat = clean_value(payload.get("alamat")) or None
        gi.aktif = bool_value(payload.get("aktif", gi.aktif))
        add_audit_log(
            actor=actor,
            action="UPDATE_GI",
            entity_type="gardu_induk",
            entity_id=gi.id,
            detail={"before": before, "after": gi.to_dict()},
        )
        db.session.commit()
        return gi.to_dict()
    except Exception:
        db.session.rollback()
        raise
