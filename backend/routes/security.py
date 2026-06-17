"""Security administration routes."""

from flask import Blueprint, jsonify, request

from ..core.access import module_access_payload
from ..core.constants import ROLES
from ..core.security import audit, bool_value, request_payload, validate_password_policy
from ..models import AuditLog, User, db
from ._app_bridge import require_roles


security_bp = Blueprint("security", __name__)


@security_bp.get("/api/audit-log")
def api_audit_log():
    denied = require_roles("admin")
    if denied:
        return denied
    try:
        limit = request.args.get("limit", default=100, type=int)
        limit = min(max(limit, 1), 500)
        rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
        return jsonify([row.to_dict() for row in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@security_bp.get("/api/security-summary")
def api_security_summary():
    denied = require_roles("admin")
    if denied:
        return denied
    try:
        users_total = User.query.count()
        active_users = User.query.filter_by(aktif=True).count()
        failed_logins = AuditLog.query.filter_by(action="LOGIN_FAILED").count()
        imports = AuditLog.query.filter(
            AuditLog.action.in_(["IMPORT_NKWH", "IMPORT_PENYULANG"])
        ).count()
        return jsonify({
            "users_total": users_total,
            "active_users": active_users,
            "failed_logins": failed_logins,
            "imports": imports,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@security_bp.get("/api/module-access")
def api_module_access():
    denied = require_roles("admin")
    if denied:
        return denied
    try:
        return jsonify(module_access_payload(request.args.get("role")))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@security_bp.get("/api/users")
def api_users_list():
    denied = require_roles("admin")
    if denied:
        return denied
    try:
        rows = User.query.order_by(User.username).all()
        return jsonify([row.to_dict() for row in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@security_bp.post("/api/users")
def api_users_create():
    denied = require_roles("admin")
    if denied:
        return denied
    payload = request_payload()
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    role = (payload.get("role") or "viewer").strip().lower()
    if not username:
        return jsonify({"error": "Username wajib diisi."}), 400
    if role not in ROLES:
        return jsonify({"error": "Role tidak valid."}), 400
    password_error = validate_password_policy(password)
    if password_error:
        return jsonify({"error": password_error}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username sudah digunakan."}), 409

    user = User(
        username=username,
        nama_lengkap=(payload.get("nama_lengkap") or "").strip() or username,
        email=(payload.get("email") or "").strip() or None,
        role=role,
        aktif=bool_value(payload.get("aktif", True)),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
    audit("CREATE_USER", entity_type="user", entity_id=user.id, detail=user.to_dict())
    db.session.commit()
    return jsonify(user.to_dict()), 201


@security_bp.route("/api/users/<int:user_id>", methods=["PATCH", "POST"])
def api_users_update(user_id):
    denied = require_roles("admin")
    if denied:
        return denied
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User tidak ditemukan."}), 404
    payload = request_payload()
    role = (payload.get("role") or user.role).strip().lower()
    if role not in ROLES:
        return jsonify({"error": "Role tidak valid."}), 400
    admin_count = User.query.filter_by(role="admin", aktif=True).count()
    new_active = bool_value(payload.get("aktif", user.aktif))
    if user.role == "admin" and (role != "admin" or not new_active) and admin_count <= 1:
        return jsonify({"error": "Minimal harus ada satu admin aktif."}), 400

    before = user.to_dict()
    user.nama_lengkap = (payload.get("nama_lengkap") or user.nama_lengkap or user.username).strip()
    user.email = (payload.get("email") or "").strip() or None
    user.role = role
    user.aktif = new_active
    db.session.flush()
    audit("UPDATE_USER", entity_type="user", entity_id=user.id, detail={
        "before": before,
        "after": user.to_dict(),
    })
    db.session.commit()
    return jsonify(user.to_dict())


@security_bp.post("/api/users/<int:user_id>/password")
def api_users_reset_password(user_id):
    denied = require_roles("admin")
    if denied:
        return denied
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User tidak ditemukan."}), 404
    payload = request_payload()
    password = payload.get("password") or ""
    password_error = validate_password_policy(password)
    if password_error:
        return jsonify({"error": password_error}), 400
    user.set_password(password)
    db.session.flush()
    audit("RESET_USER_PASSWORD", entity_type="user", entity_id=user.id, detail={"username": user.username})
    db.session.commit()
    return jsonify({"message": "Password berhasil direset."})
