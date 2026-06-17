"""Dashboard API routes."""

from flask import Blueprint, jsonify, request

from ..services.dashboard_data import get_dashboard_data


dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/api/dashboard-data")
def api_dashboard_data():
    try:
        year = request.args.get("tahun", type=int)
        return jsonify(get_dashboard_data(year=year))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
