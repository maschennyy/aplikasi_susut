"""Current-user profile routes."""

from flask import Blueprint, g, jsonify

from ._app_bridge import core


profile_bp = Blueprint("profile", __name__)


@profile_bp.route("/api/me", methods=["GET", "PATCH", "POST"])
def api_me_profile():
    app_module = core()
    user = getattr(g, "current_user", None)
    if not user:
        return jsonify({"error": "Login diperlukan."}), 401
    if app_module.request.method == "GET":
        return jsonify(user.to_dict())
    payload = app_module._request_payload()
    before = user.to_dict()
    user.nama_lengkap = (payload.get("nama_lengkap") or user.nama_lengkap or user.username).strip()
    user.email = (payload.get("email") or "").strip() or None
    app_module.db.session.flush()
    app_module._audit("UPDATE_OWN_PROFILE", entity_type="user", entity_id=user.id, detail={
        "before": before,
        "after": user.to_dict(),
    })
    app_module.db.session.commit()
    return jsonify(user.to_dict())


@profile_bp.post("/api/me/password")
def api_change_own_password():
    app_module = core()
    user = getattr(g, "current_user", None)
    if not user:
        return jsonify({"error": "Login diperlukan."}), 401
    payload = app_module._request_payload()
    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    if not user.check_password(current_password):
        return jsonify({"error": "Password lama tidak sesuai."}), 400
    password_error = app_module._validate_password_policy(new_password)
    if password_error:
        return jsonify({"error": password_error}), 400
    user.set_password(new_password)
    app_module.db.session.flush()
    app_module._audit("CHANGE_OWN_PASSWORD", entity_type="user", entity_id=user.id, detail={"username": user.username})
    app_module.db.session.commit()
    return jsonify({"message": "Password berhasil diganti."})
