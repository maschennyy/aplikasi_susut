"""Penyulang routes registered on the shared master blueprint."""

from flask import jsonify, request

from ..models import db
from ..services.penyulang import (
    PenyulangServiceError,
    create_penyulang,
    list_penyulangs,
    update_penyulang,
)


def register_penyulang_routes(
    master_bp,
    *,
    writer_denied,
    request_payload,
    audit_actor,
    json_error,
):
    @master_bp.route("/api/penyulang", methods=["GET", "POST"])
    def api_penyulang():
        try:
            if request.method == "POST":
                denied = writer_denied()
                if denied:
                    return denied
                return jsonify(
                    create_penyulang(request_payload(), audit_actor())
                ), 201

            return jsonify(list_penyulangs(
                include_inactive=request.args.get("all") == "1",
                trafo_id=request.args.get("trafo_id", type=int),
                gi_id=request.args.get("gi_id", type=int),
                area_up3=request.args.get("area_up3", ""),
                status=request.args.get("status", ""),
            ))
        except PenyulangServiceError as exc:
            return json_error(str(exc), exc.status_code)
        except Exception as exc:
            db.session.rollback()
            return jsonify({"error": str(exc)}), 500

    @master_bp.route(
        "/api/penyulang/<int:penyulang_id>",
        methods=["PATCH", "POST"],
    )
    def api_penyulang_update(penyulang_id: int):
        denied = writer_denied()
        if denied:
            return denied

        try:
            return jsonify(update_penyulang(
                penyulang_id,
                request_payload(),
                audit_actor(),
            ))
        except PenyulangServiceError as exc:
            return json_error(str(exc), exc.status_code)
        except Exception as exc:
            db.session.rollback()
            return jsonify({"error": str(exc)}), 500
