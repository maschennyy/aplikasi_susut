"""Monthly workflow routes backed by dedicated services."""

from datetime import date, datetime

from flask import Blueprint, g, jsonify, request

from ..core.constants import WORKFLOW_STATUS_LABELS
from ..core.security import audit, bool_value, json_error, request_payload
from ..models import MonthlyDataStatus, db
from ..services.monthly_readiness import readiness_payload
from ..services.monthly_workflow import (
    monthly_activity_payload,
    normalize_workflow_status,
    workflow_allowed_statuses,
    workflow_payload,
    workflow_period,
    workflow_record,
)
from ._app_bridge import require_roles


workflow_bp = Blueprint("workflow", __name__)


def _clean_value(value, default=""):
    text_value = str(value or "").strip()
    return text_value if text_value else default


@workflow_bp.get("/api/monthly-status")
def api_monthly_status_list():
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    try:
        year = request.args.get("tahun", default=date.today().year, type=int)
        start = date(year, 1, 1)
        end = date(year + 1, 1, 1)
        rows = MonthlyDataStatus.query.filter(
            MonthlyDataStatus.periode_bulan >= start,
            MonthlyDataStatus.periode_bulan < end,
        ).all()
        by_month = {row.periode_bulan.month: row for row in rows}
        payload_rows = [
            workflow_payload(date(year, month, 1), by_month.get(month))
            for month in range(1, 13)
        ]
        return jsonify({"tahun": year, "rows": payload_rows})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@workflow_bp.route("/api/monthly-status/<periode>", methods=["GET", "PATCH", "POST"])
def api_monthly_status_detail(periode):
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    try:
        period = workflow_period(periode)
        record = workflow_record(period, create=request.method != "GET")

        if request.method == "GET":
            return jsonify(workflow_payload(period, record))

        payload = request_payload()
        new_status = normalize_workflow_status(payload.get("status"))
        current_status = normalize_workflow_status(record.status)
        user = getattr(g, "current_user", None)
        allowed = workflow_allowed_statuses(current_status, user)
        if new_status not in allowed:
            return json_error(
                f"Transisi status dari {WORKFLOW_STATUS_LABELS[current_status]} "
                f"ke {WORKFLOW_STATUS_LABELS[new_status]} tidak diizinkan.",
                400,
            )
        if new_status == "TERKUNCI" and (not user or user.role != "admin"):
            return json_error("Hanya admin yang bisa mengunci periode.", 403)

        force_finalize = bool_value(payload.get("force_finalize") or payload.get("force"))
        readiness = None
        if new_status in {"FINAL", "TERKUNCI"}:
            readiness = readiness_payload(period)
            if not readiness["can_finalize"]:
                can_override = user and user.role == "admin" and force_finalize
                note = _clean_value(payload.get("catatan"))
                if not can_override:
                    return jsonify({
                        "error": "Data wajib periode ini belum lengkap untuk Final/Terkunci.",
                        "blockers": readiness["blockers"],
                        "readiness": readiness,
                    }), 409
                if not note:
                    return jsonify({
                        "error": "Catatan wajib diisi untuk override Final/Terkunci.",
                        "blockers": readiness["blockers"],
                        "readiness": readiness,
                    }), 400

        record.status = new_status
        record.catatan = _clean_value(payload.get("catatan")) or None
        if new_status == "TERKUNCI":
            record.locked_at = datetime.utcnow()
            record.locked_by = user.username if user else None
        else:
            record.locked_at = None
            record.locked_by = None

        audit("UPDATE_MONTHLY_STATUS", entity_type="monthly_data_status", entity_id=record.id, detail={
            "periode_bulan": period.strftime("%Y-%m-%d"),
            "from_status": current_status,
            "to_status": new_status,
            "force_finalize": force_finalize,
            "readiness_score": readiness["score"] if readiness else None,
            "readiness_blockers": readiness["blockers"] if readiness else [],
        })
        db.session.commit()
        return jsonify(workflow_payload(period, record))
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@workflow_bp.get("/api/monthly-status/<periode>/activity")
def api_monthly_status_activity(periode):
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    try:
        period = workflow_period(periode)
        limit = min(request.args.get("limit", default=30, type=int), 100)
        return jsonify(monthly_activity_payload(period, limit))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@workflow_bp.get("/api/monthly-status/<periode>/readiness")
def api_monthly_status_readiness(periode):
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    try:
        period = workflow_period(periode)
        return jsonify(readiness_payload(period))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@workflow_bp.get("/api/monthly-status/<periode>/audit-package")
def api_monthly_status_audit_package(periode):
    denied = require_roles("admin", "operator", "auditor")
    if denied:
        return denied
    try:
        period = workflow_period(periode)
        workflow = workflow_payload(period)
        readiness = readiness_payload(period)
        activity = monthly_activity_payload(period, 100)
        user = getattr(g, "current_user", None)
        return jsonify({
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "generated_by": user.username if user else None,
            "periode": period.strftime("%Y-%m"),
            "periode_bulan": period.strftime("%Y-%m-%d"),
            "summary": {
                "workflow_status": workflow["status"],
                "workflow_label": workflow["label"],
                "readiness_score": readiness["score"],
                "can_finalize": readiness["can_finalize"],
                "blocker_count": len(readiness["blockers"]),
                "alert_count": readiness["alert_count"],
                "activity_count": len(activity["rows"]),
            },
            "workflow": workflow,
            "readiness": readiness,
            "activity": activity["rows"],
        })
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
