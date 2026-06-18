"""Upload and NKWh import routes."""

from flask import Blueprint, current_app, jsonify, request

from ..core.security import require_roles
from ..services.upload_import import (
    UploadImportError,
    analyze_nkwh_upload,
    import_nkwh_upload,
    import_penyulang_upload,
    validate_generic_upload,
)


upload_bp = Blueprint("upload", __name__)


def _required_file():
    if "file" not in request.files:
        raise UploadImportError("Tidak ada file yang dikirim")
    file = request.files["file"]
    if not file.filename:
        raise UploadImportError("Nama file kosong")
    return file


def _upload_error_response(exc):
    return jsonify(exc.payload), exc.status_code


def _unexpected_upload_error(action, exc):
    current_app.logger.exception("%s failed", action)
    return jsonify({"error": "Internal Server Error"}), 500


@upload_bp.post("/api/upload")
def api_upload():
    denied = require_roles("admin", "operator")
    if denied:
        return denied

    try:
        payload = validate_generic_upload(
            _required_file(),
            content_length=request.content_length,
        )
        return jsonify(payload), 200
    except UploadImportError as exc:
        return _upload_error_response(exc)
    except Exception as exc:
        return _unexpected_upload_error("GENERIC_UPLOAD", exc)


@upload_bp.post("/api/nkwh/analyze")
def api_nkwh_analyze():
    denied = require_roles("admin", "operator")
    if denied:
        return denied

    try:
        payload = analyze_nkwh_upload(
            _required_file(),
            default_bulan=request.form.get("bulan", "").strip(),
            content_length=request.content_length,
        )
        return jsonify(payload), 200
    except UploadImportError as exc:
        return _upload_error_response(exc)
    except Exception as exc:
        return _unexpected_upload_error("ANALYZE_NKWH", exc)


@upload_bp.post("/api/nkwh/import")
def api_nkwh_import():
    denied = require_roles("admin", "operator")
    if denied:
        return denied

    try:
        payload = import_nkwh_upload(
            _required_file(),
            threshold_pct=request.form.get("threshold_pct", default=25, type=float),
            min_delta=request.form.get("min_delta", default=10000, type=float),
            default_bulan=request.form.get("bulan", "").strip(),
            import_exim=request.form.get("import_exim", "1") == "1",
            content_length=request.content_length,
        )
        return jsonify(payload), 200
    except UploadImportError as exc:
        return _upload_error_response(exc)
    except Exception as exc:
        return _unexpected_upload_error("IMPORT_NKWH", exc)


@upload_bp.post("/api/upload-penyulang")
def api_upload_penyulang():
    denied = require_roles("admin", "operator")
    if denied:
        return denied

    try:
        payload = import_penyulang_upload(
            _required_file(),
            default_gi_id=request.form.get("gi_id", type=int),
            default_trafo_id=request.form.get("trafo_id", type=int),
            default_bulan=request.form.get("bulan", "").strip(),
            threshold_pct=request.form.get("threshold_pct", default=25, type=float),
            min_delta=request.form.get("min_delta", default=10000, type=float),
            content_length=request.content_length,
        )
        return jsonify(payload), 200
    except UploadImportError as exc:
        return _upload_error_response(exc)
    except Exception as exc:
        return _unexpected_upload_error("IMPORT_PENYULANG", exc)
