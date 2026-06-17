"""Penyulang master data operations."""

from __future__ import annotations

from typing import Any, Mapping

from ..models import Penyulang, Trafo, db
from .area_unit import bool_value, clean_value
from .audit_log import AuditActor, add_audit_log


VALID_STATUSES = {"AKTIF", "NONAKTIF", "CADANGAN"}


class PenyulangServiceError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _parse_trafo(value: Any, *, message: str) -> Trafo:
    try:
        trafo_id = int(value or 0)
    except (TypeError, ValueError) as exc:
        raise PenyulangServiceError(message, 400) from exc

    trafo = db.session.get(Trafo, trafo_id)
    if not trafo:
        raise PenyulangServiceError(message, 400)
    return trafo


def _validated_status(value: Any) -> str:
    status = clean_value(value).upper()
    if status not in VALID_STATUSES:
        choices = ", ".join(sorted(VALID_STATUSES))
        raise PenyulangServiceError(
            f"Status penyulang harus salah satu dari: {choices}.",
            400,
        )
    return status


def _resolve_status_and_active(
    payload: Mapping[str, Any],
    *,
    current_status: str = "AKTIF",
    current_active: bool = True,
) -> tuple[str, bool]:
    status_supplied = "status" in payload and clean_value(payload.get("status")) != ""
    active_supplied = "aktif" in payload and payload.get("aktif") not in (None, "")

    if status_supplied:
        status = _validated_status(payload.get("status"))
        return status, status != "NONAKTIF"

    if active_supplied:
        active = bool_value(payload.get("aktif"))
        if not active:
            return "NONAKTIF", False

        normalized_current = clean_value(current_status, "AKTIF").upper()
        if normalized_current in {"AKTIF", "CADANGAN"}:
            return normalized_current, True
        return "AKTIF", True

    normalized_current = clean_value(current_status, "AKTIF").upper()
    if normalized_current not in VALID_STATUSES:
        normalized_current = "AKTIF" if current_active else "NONAKTIF"
    return normalized_current, normalized_current != "NONAKTIF"


def _optional_text(
    payload: Mapping[str, Any],
    key: str,
    current: str | None,
) -> str | None:
    if key not in payload:
        return current
    return clean_value(payload.get(key)) or None


def list_penyulangs(
    *,
    include_inactive: bool = False,
    trafo_id: int | None = None,
    gi_id: int | None = None,
    area_up3: str = "",
    status: str = "",
) -> list[dict]:
    normalized_status = clean_value(status).upper()
    if normalized_status:
        normalized_status = _validated_status(normalized_status)

    query = Penyulang.query
    if not normalized_status and not include_inactive:
        query = query.filter_by(aktif=True)
    if trafo_id:
        query = query.filter_by(trafo_id=trafo_id)
    if gi_id:
        query = query.filter_by(gi_id=gi_id)
    if clean_value(area_up3):
        query = query.filter(Penyulang.area_up3 == clean_value(area_up3))
    if normalized_status:
        query = query.filter(Penyulang.status == normalized_status)

    return [
        row.to_dict()
        for row in query.order_by(Penyulang.kode_penyulang).all()
    ]


def create_penyulang(payload: Mapping[str, Any], actor: AuditActor) -> dict:
    trafo = _parse_trafo(
        payload.get("trafo_id"),
        message="Trafo wajib dipilih.",
    )
    kode = clean_value(payload.get("kode_penyulang")).upper()
    nama = clean_value(payload.get("nama_penyulang"))
    if not kode or not nama:
        raise PenyulangServiceError(
            "Kode penyulang dan nama penyulang wajib diisi.",
            400,
        )

    if Penyulang.query.filter_by(
        trafo_id=trafo.id,
        kode_penyulang=kode,
    ).first():
        raise PenyulangServiceError(
            "Kode penyulang sudah ada di trafo ini.",
            409,
        )

    status, active = _resolve_status_and_active(payload)

    try:
        penyulang = Penyulang(
            trafo_id=trafo.id,
            gi_id=trafo.gi_id,
            kode_penyulang=kode,
            nama_penyulang=nama,
            jenis=clean_value(payload.get("jenis"), "REGULAR").upper(),
            area_up3=clean_value(payload.get("area_up3")) or None,
            ex_cabang=clean_value(payload.get("ex_cabang")) or None,
            status=status,
            aktif=active,
        )
        db.session.add(penyulang)
        add_audit_log(
            actor=actor,
            action="CREATE_PENYULANG",
            entity_type="penyulang",
            detail={
                "kode_penyulang": kode,
                "trafo_id": trafo.id,
                "gi_id": trafo.gi_id,
            },
        )
        db.session.commit()
        return penyulang.to_dict()
    except Exception:
        db.session.rollback()
        raise


def update_penyulang(
    penyulang_id: int,
    payload: Mapping[str, Any],
    actor: AuditActor,
) -> dict:
    penyulang = db.session.get(Penyulang, penyulang_id)
    if not penyulang:
        raise PenyulangServiceError("Penyulang tidak ditemukan.", 404)

    trafo = _parse_trafo(
        payload.get("trafo_id") or penyulang.trafo_id,
        message="Trafo tidak ditemukan.",
    )
    kode = clean_value(
        payload.get("kode_penyulang"),
        penyulang.kode_penyulang,
    ).upper()
    nama = clean_value(
        payload.get("nama_penyulang"),
        penyulang.nama_penyulang,
    )

    existing = Penyulang.query.filter(
        Penyulang.trafo_id == trafo.id,
        Penyulang.kode_penyulang == kode,
        Penyulang.id != penyulang.id,
    ).first()
    if existing:
        raise PenyulangServiceError(
            "Kode penyulang sudah ada di trafo ini.",
            409,
        )

    status, active = _resolve_status_and_active(
        payload,
        current_status=penyulang.status or "AKTIF",
        current_active=bool(penyulang.aktif),
    )

    try:
        before = penyulang.to_dict()
        penyulang.trafo_id = trafo.id
        penyulang.gi_id = trafo.gi_id
        penyulang.kode_penyulang = kode
        penyulang.nama_penyulang = nama
        penyulang.jenis = clean_value(
            payload.get("jenis"),
            penyulang.jenis or "REGULAR",
        ).upper()
        penyulang.area_up3 = _optional_text(
            payload,
            "area_up3",
            penyulang.area_up3,
        )
        penyulang.ex_cabang = _optional_text(
            payload,
            "ex_cabang",
            penyulang.ex_cabang,
        )
        penyulang.status = status
        penyulang.aktif = active
        db.session.flush()

        add_audit_log(
            actor=actor,
            action="UPDATE_PENYULANG",
            entity_type="penyulang",
            entity_id=penyulang.id,
            detail={"before": before, "after": penyulang.to_dict()},
        )
        db.session.commit()
        return penyulang.to_dict()
    except Exception:
        db.session.rollback()
        raise
