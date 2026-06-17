"""Monthly data workflow lifecycle and activity services."""

import json
from datetime import date, datetime

from flask import g

from ..core.constants import (
    MONTHLY_ACTIVITY_ACTIONS,
    WORKFLOW_STATUS_LABELS,
    WORKFLOW_STATUS_ORDER,
    WORKFLOW_TRANSITIONS,
    WORKFLOW_WRITABLE_STATUSES,
)
from ..core.security import audit
from ..models import AuditLog, MonthlyDataStatus, db


def normalize_workflow_status(value):
    raw = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    compact = raw.replace("_", "")
    aliases = {
        "DRAFT": "DRAFT",
        "SUDAHUPLOAD": "SUDAH_UPLOAD",
        "UPLOAD": "SUDAH_UPLOAD",
        "SUDAHDICEK": "SUDAH_DICEK",
        "DICEK": "SUDAH_DICEK",
        "CHECKED": "SUDAH_DICEK",
        "FINAL": "FINAL",
        "TERKUNCI": "TERKUNCI",
        "LOCKED": "TERKUNCI",
    }
    status = aliases.get(compact, raw)
    if status not in WORKFLOW_STATUS_ORDER:
        raise ValueError("Status workflow tidak dikenali.")
    return status


def workflow_period(value):
    if isinstance(value, datetime):
        return date(value.year, value.month, 1)
    if isinstance(value, date):
        return date(value.year, value.month, 1)

    raw = str(value or "").strip()
    try:
        if len(raw) == 7 and raw[4] == "-":
            return date(int(raw[:4]), int(raw[5:7]), 1)
        parsed = date.fromisoformat(raw)
        return date(parsed.year, parsed.month, 1)
    except (TypeError, ValueError):
        raise ValueError("Format periode harus YYYY-MM.")


def workflow_record(period, create=False):
    record = MonthlyDataStatus.query.filter_by(periode_bulan=period).first()
    if not record and create:
        record = MonthlyDataStatus(periode_bulan=period, status="DRAFT")
        db.session.add(record)
        db.session.flush()
    return record


def workflow_allowed_statuses(status, user=None):
    allowed = list(WORKFLOW_TRANSITIONS.get(status, ["DRAFT"]))
    if status == "TERKUNCI" and (not user or user.role != "admin"):
        return ["TERKUNCI"]
    if "TERKUNCI" in allowed and (not user or user.role != "admin"):
        allowed.remove("TERKUNCI")
    return allowed


def workflow_payload(period, record=None, user=None):
    record = record if record is not None else workflow_record(period)
    status = normalize_workflow_status(record.status) if record else "DRAFT"
    current_index = WORKFLOW_STATUS_ORDER.index(status)
    if user is None:
        user = getattr(g, "current_user", None)
    allowed = workflow_allowed_statuses(status, user)

    return {
        "id": record.id if record else None,
        "periode": period.strftime("%Y-%m"),
        "periode_bulan": period.strftime("%Y-%m-%d"),
        "status": status,
        "label": WORKFLOW_STATUS_LABELS[status],
        "catatan": record.catatan if record else "",
        "locked": status == "TERKUNCI",
        "writable": status in WORKFLOW_WRITABLE_STATUSES,
        "locked_at": record.locked_at.isoformat() if record and record.locked_at else None,
        "locked_by": record.locked_by if record else None,
        "updated_at": record.updated_at.isoformat() if record and record.updated_at else None,
        "allowed_next": [
            {"status": code, "label": WORKFLOW_STATUS_LABELS[code]}
            for code in allowed
        ],
        "steps": [
            {
                "status": code,
                "label": WORKFLOW_STATUS_LABELS[code],
                "done": index < current_index,
                "active": code == status,
                "locked": code == "TERKUNCI",
            }
            for index, code in enumerate(WORKFLOW_STATUS_ORDER)
        ],
    }


def ensure_period_writable(period):
    record = workflow_record(period)
    if not record:
        return
    status = normalize_workflow_status(record.status)
    if status not in WORKFLOW_WRITABLE_STATUSES:
        label = WORKFLOW_STATUS_LABELS[status]
        raise ValueError(
            f'Periode {period.strftime("%Y-%m")} berstatus {label}. '
            "Turunkan status ke Draft/Sudah Upload sebelum import ulang."
        )


def mark_period_uploaded(period, source, filename=None):
    record = workflow_record(period, create=True)
    status = normalize_workflow_status(record.status)
    if status == "DRAFT":
        record.status = "SUDAH_UPLOAD"
    if not record.catatan:
        record.catatan = f"Upload terakhir dari {source}."
    if record.status != "TERKUNCI":
        record.locked_at = None
        record.locked_by = None
    audit("MARK_MONTH_UPLOADED", entity_type="monthly_data_status", entity_id=record.id, detail={
        "periode_bulan": period.strftime("%Y-%m-%d"),
        "source": source,
        "filename": filename,
        "status": record.status,
    })
    return record


def _audit_detail(record):
    try:
        return json.loads(record.detail_json or "{}")
    except (TypeError, ValueError):
        return {}


def _audit_month_summary(detail):
    labels = {
        "filename": "File",
        "source": "Sumber",
        "from_status": "Dari",
        "to_status": "Ke",
        "created": "Baru",
        "updated": "Update",
        "alerts": "Alert",
        "error_count": "Error",
        "feeder_count": "Penyulang",
        "gi_count": "GI",
    }
    parts = []
    for key, label in labels.items():
        value = detail.get(key)
        if value in (None, "", []):
            continue
        parts.append(f"{label}: {value}")
    return "; ".join(parts) or "-"


def monthly_activity_payload(period, limit=30):
    period_day = period.strftime("%Y-%m-%d")
    period_month = period.strftime("%Y-%m")
    rows = AuditLog.query.filter(AuditLog.action.in_(MONTHLY_ACTIVITY_ACTIONS)).filter(
        (AuditLog.detail_json.contains(period_day))
        | (AuditLog.detail_json.contains(period_month))
    ).order_by(AuditLog.created_at.desc()).limit(limit).all()

    activities = []
    for row in rows:
        detail = _audit_detail(row)
        activities.append({
            "id": row.id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "username": row.username or "-",
            "role": row.role or "-",
            "action": row.action,
            "status": row.status,
            "summary": _audit_month_summary(detail),
            "detail": detail,
        })
    return {
        "periode": period_month,
        "periode_bulan": period_day,
        "rows": activities,
    }
