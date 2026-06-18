"""Reusable security and request helpers.

The functions in this module are intentionally independent from ``app.py`` so
blueprints can use them without importing the application monolith.
"""

import json

from flask import current_app, g, jsonify, request

from ..models import AuditLog, db


def json_error(message, status=400):
    return jsonify({"error": message}), status


def require_roles(*roles):
    user = getattr(g, "current_user", None)
    if not user or user.role not in roles:
        return json_error("Akses ditolak.", 403)
    return None


def request_payload():
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict()


def bool_value(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on", "aktif"}


def validate_password_policy(password):
    min_len = current_app.config.get("PASSWORD_MIN_LENGTH", 10)
    if len(password or "") < min_len:
        return f"Password minimal {min_len} karakter."

    checks = [
        any(character.islower() for character in password),
        any(character.isupper() for character in password),
        any(character.isdigit() for character in password),
        any(not character.isalnum() for character in password),
    ]
    if sum(checks) < 3:
        return (
            "Password harus memakai minimal 3 jenis karakter: huruf kecil, "
            "huruf besar, angka, atau simbol."
        )
    return None


def client_ip():
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def audit(action, entity_type=None, entity_id=None, detail=None, status="SUCCESS", username=None):
    user = getattr(g, "current_user", None)
    record = AuditLog(
        user_id=user.id if user else None,
        username=username or (user.username if user else None),
        role=user.role if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        status=status,
        ip_address=client_ip(),
        user_agent=(request.headers.get("User-Agent") or "")[:255],
        detail_json=json.dumps(detail or {}, ensure_ascii=False),
    )
    db.session.add(record)
    return record
