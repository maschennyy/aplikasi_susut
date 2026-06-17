"""Routes for kWh sales by customer tariff class."""

from datetime import date

from flask import Blueprint, g, jsonify, request

from ..catalogs.customer_classes import catalog_payload
from ..core.constants import WRITE_ROLES
from ..core.security import client_ip, json_error, request_payload
from ..models import db
from ..services.audit_log import AuditActor
from ..services.kwh_jual import (
    KwhJualServiceError,
    get_kwh_jual,
    normalize_period,
    upsert_kwh_jual,
)


kwh_jual_bp = Blueprint("kwh_jual", __name__)


def _writer_denied():
    user = getattr(g, "current_user", None)
    if not user or user.role not in WRITE_ROLES:
        return json_error(
            "Akses ubah master data hanya untuk admin/operator.",
            403,
        )
    return None


def _audit_actor() -> AuditActor:
    user = getattr(g, "current_user", None)
    return AuditActor(
        user_id=user.id if user else None,
        username=user.username if user else None,
        role=user.role if user else None,
        ip_address=client_ip(),
        user_agent=request.headers.get("User-Agent") or "",
    )


@kwh_jual_bp.get("/api/kwh-jual/catalog")
def api_kwh_jual_catalog():
    return jsonify(catalog_payload())


@kwh_jual_bp.route("/api/kwh-jual", methods=["GET", "POST"])
def api_kwh_jual():
    try:
        if request.method == "GET":
            gi_id = request.args.get("gi_id", type=int)
            raw_period = (
                request.args.get("bulan")
                or request.args.get("periode")
                or date.today().strftime("%Y-%m")
            )
            return jsonify(get_kwh_jual(
                gi_id,
                normalize_period(raw_period),
            ))

        denied = _writer_denied()
        if denied:
            return denied

        payload = request_payload()
        gi_id = int(payload.get("gi_id") or 0)
        raw_period = (
            payload.get("bulan")
            or payload.get("periode")
            or payload.get("periode_bulan")
        )
        entries = payload.get("entries")
        if entries is None:
            entries = payload.get("detail")
        if entries is None:
            entries = []

        result = upsert_kwh_jual(
            gi_id=gi_id,
            period=normalize_period(raw_period),
            entries=entries,
            actor=_audit_actor(),
        )
        return jsonify(result)
    except KwhJualServiceError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), exc.status_code
    except (TypeError, ValueError) as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500
