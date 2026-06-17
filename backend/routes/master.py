"""Master data API routes."""

from flask import Blueprint, g, jsonify, request

from ..models import db
from ..services.area_unit import (
    AreaUnitServiceError,
    create_area_unit,
    list_area_units,
    update_area_unit,
)
from ..services.audit_log import AuditActor
from ..services.gardu_induk import (
    GarduIndukServiceError,
    create_gardu_induk,
    list_gardu_induk,
    update_gardu_induk,
)
from ..services.master_summary import get_master_data_summary


master_bp = Blueprint("master", __name__)
MASTER_WRITE_ROLES = {"admin", "operator"}


def _json_error(message: str, status: int):
    return jsonify({"error": message}), status


def _request_payload() -> dict:
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict()


def _master_writer_denied():
    user = getattr(g, "current_user", None)
    if not user or user.role not in MASTER_WRITE_ROLES:
        return _json_error(
            "Akses ubah master data hanya untuk admin/operator.",
            403,
        )
    return None


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _audit_actor() -> AuditActor:
    user = getattr(g, "current_user", None)
    return AuditActor(
        user_id=user.id if user else None,
        username=user.username if user else None,
        role=user.role if user else None,
        ip_address=_client_ip(),
        user_agent=request.headers.get("User-Agent") or "",
    )


@master_bp.get("/api/master-data/summary")
def api_master_summary():
    """Return active master totals and incomplete mapping counts."""
    try:
        return jsonify(get_master_data_summary())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@master_bp.route("/api/area-unit", methods=["GET", "POST"])
def api_area_unit():
    try:
        if request.method == "POST":
            denied = _master_writer_denied()
            if denied:
                return denied
            result = create_area_unit(_request_payload(), _audit_actor())
            return jsonify(result), 201

        include_inactive = request.args.get("all") == "1"
        return jsonify(list_area_units(include_inactive=include_inactive))
    except AreaUnitServiceError as exc:
        return _json_error(str(exc), exc.status_code)
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@master_bp.route("/api/area-unit/<int:unit_id>", methods=["PATCH", "POST"])
def api_area_unit_update(unit_id: int):
    denied = _master_writer_denied()
    if denied:
        return denied

    try:
        result = update_area_unit(
            unit_id,
            _request_payload(),
            _audit_actor(),
        )
        return jsonify(result)
    except AreaUnitServiceError as exc:
        return _json_error(str(exc), exc.status_code)
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@master_bp.route("/api/gardu-induk", methods=["GET", "POST"])
def api_gardu_induk():
    try:
        if request.method == "POST":
            denied = _master_writer_denied()
            if denied:
                return denied
            result = create_gardu_induk(_request_payload(), _audit_actor())
            return jsonify(result), 201

        include_inactive = request.args.get("all") == "1"
        return jsonify(list_gardu_induk(include_inactive=include_inactive))
    except GarduIndukServiceError as exc:
        return _json_error(str(exc), exc.status_code)
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@master_bp.route("/api/gardu-induk/<int:gi_id>", methods=["PATCH", "POST"])
def api_gardu_induk_update(gi_id: int):
    denied = _master_writer_denied()
    if denied:
        return denied

    try:
        result = update_gardu_induk(
            gi_id,
            _request_payload(),
            _audit_actor(),
        )
        return jsonify(result)
    except GarduIndukServiceError as exc:
        return _json_error(str(exc), exc.status_code)
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500
