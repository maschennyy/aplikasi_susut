"""Master-data API routes."""

from flask import Blueprint, jsonify

from ..services.master_summary import get_master_data_summary


master_bp = Blueprint("master", __name__)


@master_bp.get("/api/master-data/summary")
def api_master_summary():
    """Return master-data totals and mapping gaps."""
    try:
        return jsonify(get_master_data_summary())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
