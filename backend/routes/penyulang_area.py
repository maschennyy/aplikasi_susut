"""Register the Penyulang area lookup on the master blueprint."""

from flask import jsonify

from ..services.penyulang_area import list_active_penyulang_areas


def register_penyulang_area_route(master_bp) -> None:
    @master_bp.get("/api/penyulang-area")
    def api_penyulang_area():
        try:
            return jsonify(list_active_penyulang_areas())
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
