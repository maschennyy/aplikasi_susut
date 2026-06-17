"""Upload and NKWh import routes."""

from decimal import Decimal

from flask import Blueprint, jsonify, request

from ._app_bridge import core, require_roles


upload_bp = Blueprint("upload", __name__)


@upload_bp.post("/api/upload")
def api_upload():
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    app_module = core()
    if "file" not in request.files:
        return jsonify({"error": "Tidak ada file yang dikirim"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Nama file kosong"}), 400
    try:
        app_module._check_upload_rate()
        app_module._validate_upload_file(file, app_module.ALLOWED_GENERIC_UPLOADS)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"message": "Upload endpoint aktif. Integrasi UploadEngine belum selesai."}), 200


@upload_bp.post("/api/nkwh/analyze")
def api_nkwh_analyze():
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    app_module = core()
    if "file" not in request.files:
        return jsonify({"error": "Tidak ada file yang dikirim"}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Nama file kosong"}), 400

    try:
        app_module._check_upload_rate()
        safe_filename, _ = app_module._validate_upload_file(file, app_module.ALLOWED_NKWH_UPLOADS)
        result = app_module.analyze_workbook(file.stream)
        if result.get("kwh_penyulang", {}).get("feeder_count", 0) > app_module.app.config["MAX_IMPORT_ROWS"]:
            return jsonify({"error": f"Jumlah data penyulang melebihi batas {app_module.app.config['MAX_IMPORT_ROWS']}."}), 400
        result["filename"] = safe_filename
        default_bulan = request.form.get("bulan", "").strip()
        period_value = result.get("periode_bulan") or default_bulan
        if period_value:
            period = app_module._month_date(period_value)
            result["workflow"] = app_module._workflow_payload(period)
        app_module._audit("ANALYZE_NKWH", entity_type="upload", detail={
            "filename": safe_filename,
            "periode_bulan": result.get("periode_bulan"),
            "feeder_count": result.get("kwh_penyulang", {}).get("feeder_count"),
            "exim_rows": result.get("exim", {}).get("row_count"),
        })
        app_module.db.session.commit()
        return jsonify(result)
    except ValueError as exc:
        app_module.db.session.rollback()
        app_module._safe_commit_audit(
            "ANALYZE_NKWH",
            detail={"filename": file.filename, "error": str(exc)},
            status="FAILED",
        )
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app_module.db.session.rollback()
        app_module._safe_commit_audit(
            "ANALYZE_NKWH",
            detail={"filename": file.filename, "error": str(exc)},
            status="FAILED",
        )
        return jsonify({"error": str(exc)}), 500


@upload_bp.post("/api/nkwh/import")
def api_nkwh_import():
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    app_module = core()
    if "file" not in request.files:
        return jsonify({"error": "Tidak ada file yang dikirim"}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Nama file kosong"}), 400

    threshold_pct = request.form.get("threshold_pct", default=25, type=float)
    min_delta = request.form.get("min_delta", default=10000, type=float)
    default_bulan = request.form.get("bulan", "").strip()
    import_exim = request.form.get("import_exim", "1") == "1"

    try:
        app_module._check_upload_rate()
        safe_filename, _ = app_module._validate_upload_file(file, app_module.ALLOWED_NKWH_UPLOADS)
        parsed = app_module.parse_nkwh_feeders(file.stream)
        if parsed.get("feeder_count", 0) > app_module.app.config["MAX_IMPORT_ROWS"]:
            return jsonify({"error": f"Jumlah data penyulang melebihi batas {app_module.app.config['MAX_IMPORT_ROWS']}."}), 400
        blockers = app_module._nkwh_import_blockers(parsed)
        if blockers:
            return jsonify({"error": "Import dibatalkan karena validasi gagal.", "errors": blockers}), 400
        period = app_module._nkwh_period(parsed.get("periode_bulan"), default_bulan or None)
        app_module._ensure_period_writable(period)
        created = updated = alerts = 0

        for item in parsed.get("feeders", []):
            gi = app_module._find_or_create_gi_from_name(item.get("gardu_induk"))
            trafo = app_module._find_or_create_trafo_from_nkwh(gi, item.get("kode_trafo"), item.get("nama_trafo"))
            penyulang = app_module._find_or_create_penyulang_from_nkwh(item, gi, trafo)

            reading = app_module.FeederReading.query.filter_by(
                penyulang_id=penyulang.id,
                periode_bulan=period,
            ).first()
            if reading:
                updated += 1
            else:
                created += 1
                reading = app_module.FeederReading(
                    penyulang_id=penyulang.id,
                    periode_bulan=period,
                )
                app_module.db.session.add(reading)

            reading.trafo_id = trafo.id
            reading.gi_id = gi.id
            app_module._apply_nkwh_registers(reading, item)
            app_module.db.session.flush()
            app_module._set_anomaly(reading, threshold_pct, min_delta)
            if reading.flag_alert:
                alerts += 1

        exim_created = exim_updated = 0
        if import_exim:
            file.stream.seek(0)
            exim = app_module.parse_exim_rows(file.stream)
            exim_created, exim_updated = app_module._import_nkwh_exim_rows(exim.get("rows", []), period)

        workflow_record = app_module._mark_period_uploaded(period, "NKWH", safe_filename)
        app_module._audit("IMPORT_NKWH", entity_type="upload", detail={
            "filename": safe_filename,
            "periode_bulan": period.strftime("%Y-%m-%d"),
            "created": created,
            "updated": updated,
            "alerts": alerts,
            "exim_created": exim_created,
            "exim_updated": exim_updated,
            "feeder_count": parsed.get("feeder_count", 0),
            "gi_count": parsed.get("gi_count", 0),
            "workflow_status": workflow_record.status,
        })
        app_module.db.session.commit()
        return jsonify({
            "message": "Import NKWh selesai",
            "periode_bulan": period.strftime("%Y-%m-%d"),
            "created": created,
            "updated": updated,
            "alerts": alerts,
            "exim_created": exim_created,
            "exim_updated": exim_updated,
            "feeder_count": parsed.get("feeder_count", 0),
            "gi_count": parsed.get("gi_count", 0),
            "total_kwh": parsed.get("total_kwh", 0),
            "workflow": app_module._workflow_payload(period, workflow_record),
        })
    except ValueError as exc:
        app_module.db.session.rollback()
        app_module._safe_commit_audit(
            "IMPORT_NKWH",
            detail={"filename": file.filename, "error": str(exc)},
            status="FAILED",
        )
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app_module.db.session.rollback()
        app_module._safe_commit_audit(
            "IMPORT_NKWH",
            detail={"filename": file.filename, "error": str(exc)},
            status="FAILED",
        )
        return jsonify({"error": str(exc)}), 500


@upload_bp.post("/api/upload-penyulang")
def api_upload_penyulang():
    denied = require_roles("admin", "operator")
    if denied:
        return denied
    app_module = core()
    if "file" not in request.files:
        return jsonify({"error": "Tidak ada file yang dikirim"}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Nama file kosong"}), 400

    default_gi_id = request.form.get("gi_id", type=int)
    default_trafo_id = request.form.get("trafo_id", type=int)
    default_bulan = request.form.get("bulan", "").strip()
    threshold_pct = request.form.get("threshold_pct", default=25, type=float)
    min_delta = request.form.get("min_delta", default=10000, type=float)

    try:
        app_module._check_upload_rate()
        safe_filename, _ = app_module._validate_upload_file(file, app_module.ALLOWED_GENERIC_UPLOADS)
        frame = app_module._read_upload_table(file)
        created = updated = alerts = 0
        errors = []
        checked_periods = set()
        imported_periods = {}

        for idx, raw in frame.iterrows():
            row = raw.to_dict()
            try:
                period = app_module._month_date(
                    app_module._pick(row, ["bulan", "periode", "periode_bulan", "month"]),
                    default_bulan or None,
                )
                period_key = period.isoformat()
                if period_key not in checked_periods:
                    app_module._ensure_period_writable(period)
                    checked_periods.add(period_key)
                gi = app_module._find_or_create_gi(row, default_gi_id)
                trafo = app_module._find_or_create_trafo(row, gi, default_trafo_id)
                penyulang = app_module._find_or_create_penyulang(row, gi, trafo)
                stand_awal, stand_akhir, faktor, wbp, lwbp1, lwbp2, total = app_module._reading_values(row)

                reading = app_module.FeederReading.query.filter_by(
                    penyulang_id=penyulang.id,
                    periode_bulan=period,
                ).first()
                if reading:
                    updated += 1
                else:
                    created += 1
                    reading = app_module.FeederReading(
                        penyulang_id=penyulang.id,
                        trafo_id=trafo.id,
                        gi_id=gi.id,
                        periode_bulan=period,
                    )
                    app_module.db.session.add(reading)

                reading.trafo_id = trafo.id
                reading.gi_id = gi.id
                reading.stand_awal = Decimal(str(stand_awal))
                reading.stand_akhir = Decimal(str(stand_akhir))
                reading.faktor_kali = Decimal(str(faktor))
                reading.kwh_wbp = Decimal(str(wbp))
                reading.kwh_lwbp1 = Decimal(str(lwbp1))
                reading.kwh_lwbp2 = Decimal(str(lwbp2))
                app_module.db.session.flush()
                app_module._set_anomaly(reading, threshold_pct, min_delta)
                if reading.flag_alert:
                    alerts += 1
                imported_periods[period_key] = period
            except Exception as row_error:
                errors.append({"baris": int(idx) + 2, "error": str(row_error)})

        if errors and not (created or updated):
            app_module.db.session.rollback()
            app_module._safe_commit_audit(
                "IMPORT_PENYULANG",
                detail={
                    "filename": safe_filename,
                    "errors": errors[:10],
                },
                status="FAILED",
            )
            return jsonify({"error": "Upload gagal. Tidak ada baris valid.", "errors": errors[:10]}), 400

        workflow_rows = []
        for period in imported_periods.values():
            record = app_module._mark_period_uploaded(period, "PENYULANG", safe_filename)
            workflow_rows.append(app_module._workflow_payload(period, record))

        app_module._audit("IMPORT_PENYULANG", entity_type="upload", detail={
            "filename": safe_filename,
            "created": created,
            "updated": updated,
            "alerts": alerts,
            "error_count": len(errors),
            "periods": sorted(imported_periods),
        })
        app_module.db.session.commit()
        return jsonify({
            "message": "Upload penyulang selesai",
            "created": created,
            "updated": updated,
            "alerts": alerts,
            "errors": errors[:10],
            "error_count": len(errors),
            "workflow": workflow_rows,
        })
    except ValueError as exc:
        app_module.db.session.rollback()
        app_module._safe_commit_audit(
            "IMPORT_PENYULANG",
            detail={"filename": file.filename, "error": str(exc)},
            status="FAILED",
        )
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app_module.db.session.rollback()
        app_module._safe_commit_audit(
            "IMPORT_PENYULANG",
            detail={"filename": file.filename, "error": str(exc)},
            status="FAILED",
        )
        return jsonify({"error": str(exc)}), 500
