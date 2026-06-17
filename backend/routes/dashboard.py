"""Dashboard API routes."""

from datetime import date

from flask import Blueprint, jsonify, request

from ..services.dashboard_data import get_dashboard_data
from ..services.executive_dashboard import get_executive_dashboard


dashboard_bp = Blueprint("dashboard", __name__)
_readiness_provider = None
_workflow_provider = None


def configure_executive_dashboard(*, readiness_provider, workflow_provider) -> None:
    """Inject existing monthly readiness and workflow payload providers."""
    global _readiness_provider, _workflow_provider
    _readiness_provider = readiness_provider
    _workflow_provider = workflow_provider


@dashboard_bp.get("/api/dashboard-data")
def api_dashboard_data():
    try:
        year = request.args.get("tahun", type=int)
        return jsonify(get_dashboard_data(year=year))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@dashboard_bp.get("/api/executive-dashboard")
def api_executive_dashboard():
    try:
        year = request.args.get("tahun", type=int) or date.today().year
        month = request.args.get("month", type=int) or date.today().month
        if month < 1 or month > 12:
            return jsonify({"error": "Bulan tidak valid."}), 400
        if _readiness_provider is None or _workflow_provider is None:
            raise RuntimeError("Executive dashboard providers belum dikonfigurasi.")

        return jsonify(get_executive_dashboard(
            period=date(year, month, 1),
            readiness_provider=_readiness_provider,
            workflow_provider=_workflow_provider,
        ))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
