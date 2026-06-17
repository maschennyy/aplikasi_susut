"""Lightweight system endpoints."""

from flask import Blueprint, jsonify

from ..services.system_stats import get_sidebar_stats


system_bp = Blueprint("system", __name__)


@system_bp.get("/api/sidebar-stats")
def api_sidebar_stats():
    """Return mini statistics used by the application sidebar."""
    try:
        return jsonify(get_sidebar_stats())
    except Exception as exc:
        return jsonify({
            "gi_aktif": 0,
            "alert_count": 0,
            "error": str(exc),
        })
