"""Authentication and CSRF routes."""

from flask import Blueprint, g, jsonify, request, session

from ._app_bridge import core


auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    app_module = core()
    if not app_module._validate_csrf():
        return jsonify({
            "success": False,
            "message": "CSRF token tidak valid.",
        }), 403

    username = (request.form.get("username") or "").strip()
    password = request.form.get("password") or ""
    rate_key = app_module._login_rate_key(username)
    if app_module._is_login_locked(rate_key):
        app_module._safe_commit_audit(
            "LOGIN_RATE_LIMITED",
            detail={"username": username},
            status="FAILED",
            username=username,
        )
        return jsonify({
            "success": False,
            "message": "Terlalu banyak percobaan login gagal. Coba lagi beberapa menit lagi.",
        }), 429
    if app_module._rate_limited(
        app_module.LOGIN_FAILURES,
        rate_key,
        app_module.app.config.get("LOGIN_RATE_LIMIT", 5),
        app_module.app.config.get("LOGIN_RATE_WINDOW_MINUTES", 15),
    ):
        app_module._safe_commit_audit(
            "LOGIN_RATE_LIMITED",
            detail={"username": username},
            status="FAILED",
            username=username,
        )
        return jsonify({
            "success": False,
            "message": "Terlalu banyak percobaan login gagal. Coba lagi beberapa menit lagi.",
        }), 429

    user = app_module.User.query.filter_by(username=username).first()
    if user and user.aktif and user.check_password(password):
        app_module._login_user(user)
        g.current_user = user
        app_module._clear_rate_events(app_module.LOGIN_FAILURES, rate_key)
        app_module._audit("LOGIN", entity_type="user", entity_id=user.id, detail={"username": user.username})
        app_module.db.session.commit()
        return jsonify({
            "success": True,
            "user": user.username,
            "role": user.role,
        }), 200

    app_module._record_rate_event(
        app_module.LOGIN_FAILURES,
        rate_key,
        app_module.app.config.get("LOGIN_RATE_WINDOW_MINUTES", 15),
    )
    if app_module._rate_limited(
        app_module.LOGIN_FAILURES,
        rate_key,
        app_module.app.config.get("LOGIN_RATE_LIMIT", 5),
        app_module.app.config.get("LOGIN_RATE_WINDOW_MINUTES", 15),
    ):
        app_module._lock_login(rate_key)
    app_module._safe_commit_audit("LOGIN_FAILED", detail={"username": username}, status="FAILED", username=username)
    return jsonify({
        "success": False,
        "message": "Username atau password salah",
    }), 401


@auth_bp.post("/logout")
def logout():
    app_module = core()
    if not app_module._validate_csrf():
        return jsonify({
            "success": False,
            "message": "CSRF token tidak valid.",
        }), 403
    username = session.get("username")
    app_module._safe_commit_audit("LOGOUT", detail={"username": username}, username=username)
    app_module._logout_user()
    return jsonify({"success": True}), 200


@auth_bp.get("/api/csrf-token")
def api_csrf_token():
    return jsonify({"csrf_token": core().csrf_token()})
