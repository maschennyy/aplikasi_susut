"""Report export routes."""

from flask import Blueprint, jsonify

from ._app_bridge import core, require_roles


export_bp = Blueprint("export", __name__)


@export_bp.get("/api/export/<module>.<fmt>")
def api_export_report(module, fmt):
    denied = require_roles("admin", "operator", "auditor")
    if denied:
        return denied
    app_module = core()
    try:
        return app_module._report_file_response(module, fmt)
    except ValueError as exc:
        app_module.db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app_module.db.session.rollback()
        return jsonify({"error": str(exc)}), 500
