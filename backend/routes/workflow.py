"""Monthly workflow routes."""

from datetime import date, datetime

from flask import Blueprint, g, jsonify, request

from ._app_bridge import core, require_roles


workflow_bp = Blueprint("workflow", __name__)


@workflow_bp.get("/api/monthly-status")
def api_monthly_status_list():
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    app_module = core()
    try:
        tahun = request.args.get("tahun", default=date.today().year, type=int)
        start = date(tahun, 1, 1)
        end = date(tahun + 1, 1, 1)
        rows = app_module.MonthlyDataStatus.query.filter(
            app_module.MonthlyDataStatus.periode_bulan >= start,
            app_module.MonthlyDataStatus.periode_bulan < end,
        ).all()
        by_month = {row.periode_bulan.month: row for row in rows}
        payload_rows = [
            app_module._workflow_payload(date(tahun, month, 1), by_month.get(month))
            for month in range(1, 13)
        ]
        return jsonify({"tahun": tahun, "rows": payload_rows})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@workflow_bp.route("/api/monthly-status/<periode>", methods=["GET", "PATCH", "POST"])
def api_monthly_status_detail(periode):
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    app_module = core()
    try:
        period = app_module._workflow_period(periode)
        record = app_module._workflow_record(period, create=request.method != "GET")

        if request.method == "GET":
            return jsonify(app_module._workflow_payload(period, record))

        denied = app_module._master_writer_required()
        if denied:
            return denied

        payload = app_module._request_payload()
        new_status = app_module._normalize_workflow_status(payload.get("status"))
        current_status = app_module._normalize_workflow_status(record.status)
        user = getattr(g, "current_user", None)
        allowed = app_module._workflow_allowed_statuses(current_status, user)
        if new_status not in allowed:
            return app_module._json_error(
                f"Transisi status dari {app_module.WORKFLOW_STATUS_LABELS[current_status]} "
                f"ke {app_module.WORKFLOW_STATUS_LABELS[new_status]} tidak diizinkan.",
                400,
            )
        if new_status == "TERKUNCI" and (not user or user.role != "admin"):
            return app_module._json_error("Hanya admin yang bisa mengunci periode.", 403)

        force_finalize = app_module._bool_value(payload.get("force_finalize") or payload.get("force"))
        readiness = None
        if new_status in {"FINAL", "TERKUNCI"}:
            readiness = app_module._readiness_payload(period)
            if not readiness["can_finalize"]:
                can_override = user and user.role == "admin" and force_finalize
                note = app_module._clean_value(payload.get("catatan"))
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
        record.catatan = app_module._clean_value(payload.get("catatan")) or None
        if new_status == "TERKUNCI":
            record.locked_at = datetime.utcnow()
            record.locked_by = user.username if user else None
        else:
            record.locked_at = None
            record.locked_by = None

        app_module._audit("UPDATE_MONTHLY_STATUS", entity_type="monthly_data_status", entity_id=record.id, detail={
            "periode_bulan": period.strftime("%Y-%m-%d"),
            "from_status": current_status,
            "to_status": new_status,
            "force_finalize": force_finalize,
            "readiness_score": readiness["score"] if readiness else None,
            "readiness_blockers": readiness["blockers"] if readiness else [],
        })
        app_module.db.session.commit()
        return jsonify(app_module._workflow_payload(period, record))
    except ValueError as exc:
        app_module.db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app_module.db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@workflow_bp.get("/api/monthly-status/<periode>/activity")
def api_monthly_status_activity(periode):
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    app_module = core()
    try:
        period = app_module._workflow_period(periode)
        limit = min(request.args.get("limit", default=30, type=int), 100)
        return jsonify(app_module._monthly_activity_payload(period, limit))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@workflow_bp.get("/api/monthly-status/<periode>/readiness")
def api_monthly_status_readiness(periode):
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    app_module = core()
    try:
        period = app_module._workflow_period(periode)
        return jsonify(app_module._readiness_payload(period))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@workflow_bp.get("/api/monthly-status/<periode>/audit-package")
def api_monthly_status_audit_package(periode):
    denied = require_roles("admin", "operator", "auditor")
    if denied:
        return denied
    app_module = core()
    try:
        period = app_module._workflow_period(periode)
        workflow = app_module._workflow_payload(period)
        readiness = app_module._readiness_payload(period)
        activity = app_module._monthly_activity_payload(period, 100)
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
