"""Read-only meter and feeder reading API routes."""

from flask import Blueprint, jsonify, request

from ..services.feeder_data import FeederDataServiceError, list_feeder_data
from ..services.meter_data import MeterDataServiceError, list_meter_data


readings_bp = Blueprint("readings", __name__)


@readings_bp.get("/api/feeder-data")
def api_feeder_data():
    try:
        return jsonify(list_feeder_data(
            gi_id=request.args.get("gi_id"),
            trafo_id=request.args.get("trafo_id"),
            month=request.args.get("bulan", ""),
            page=request.args.get("page"),
            page_size=request.args.get("page_size"),
        ))
    except FeederDataServiceError as exc:
        return jsonify({"error": str(exc)}), exc.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@readings_bp.get("/api/meter-data")
def api_meter_data():
    try:
        return jsonify(list_meter_data(
            gi_id=request.args.get("gi_id"),
            trafo_id=request.args.get("trafo_id"),
            month=request.args.get("bulan", ""),
            page=request.args.get("page"),
            page_size=request.args.get("page_size"),
        ))
    except MeterDataServiceError as exc:
        return jsonify({"error": str(exc)}), exc.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
