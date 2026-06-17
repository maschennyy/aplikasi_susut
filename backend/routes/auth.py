"""Authentication and CSRF routes."""

from flask import Blueprint, g, jsonify, request, session

from ..core.auth import (
    clear_login_failures,
    csrf_token,
    is_login_locked,
    lock_login,
    login_rate_key,
    login_rate_limited,
    login_user,
    logout_user,
    record_login_failure,
    safe_commit_audit,
    validate_csrf,
)
from ..core.security import audit
from ..models import User, db


auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    if not validate_csrf():
        return jsonify({
            "success": False,
            "message": "CSRF token tidak valid.",
        }), 403

    username = (request.form.get("username") or "").strip()
    password = request.form.get("password") or ""
    rate_key = login_rate_key(username)
    if is_login_locked(rate_key):
        safe_commit_audit(
            "LOGIN_RATE_LIMITED",
            detail={"username": username},
            status="FAILED",
            username=username,
        )
        return jsonify({
            "success": False,
            "message": "Terlalu banyak percobaan login gagal. Coba lagi beberapa menit lagi.",
        }), 429
    if login_rate_limited(rate_key):
        safe_commit_audit(
            "LOGIN_RATE_LIMITED",
            detail={"username": username},
            status="FAILED",
            username=username,
        )
        return jsonify({
            "success": False,
            "message": "Terlalu banyak percobaan login gagal. Coba lagi beberapa menit lagi.",
        }), 429

    user = User.query.filter_by(username=username).first()
    if user and user.aktif and user.check_password(password):
        login_user(user)
        g.current_user = user
        clear_login_failures(rate_key)
        audit("LOGIN", entity_type="user", entity_id=user.id, detail={"username": user.username})
        db.session.commit()
        return jsonify({
            "success": True,
            "user": user.username,
            "role": user.role,
        }), 200

    record_login_failure(rate_key)
    if login_rate_limited(rate_key):
        lock_login(rate_key)
    safe_commit_audit("LOGIN_FAILED", detail={"username": username}, status="FAILED", username=username)
    return jsonify({
        "success": False,
        "message": "Username atau password salah",
    }), 401


@auth_bp.post("/logout")
def logout():
    if not validate_csrf():
        return jsonify({
            "success": False,
            "message": "CSRF token tidak valid.",
        }), 403
    username = session.get("username")
    safe_commit_audit("LOGOUT", detail={"username": username}, username=username)
    logout_user()
    return jsonify({"success": True}), 200


@auth_bp.get("/api/csrf-token")
def api_csrf_token():
    return jsonify({"csrf_token": csrf_token()})
