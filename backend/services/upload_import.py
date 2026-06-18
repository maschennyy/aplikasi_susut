"""Upload validation and import services.

This module contains the business logic for workbook analysis and import so
route handlers do not need to reach back into the historical ``app.py` module.
"""

from collections import defaultdict, deque
from datetime import date, datetime, timedelta
from decimal import Decimal

import pandas as pd
from flask import current_app, g
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from ..core.auth import safe_commit_audit
from ..core.constants import (
    ALLOWED_GENERIC_UPLOADS,
    ALLOWED_NKWH_UPLOADS,
    XLS_SIGNATURE,
)
from ..core.security import audit, client_ip
from ..models import (
    EximMonthlyResult,
    EximRule,
    FeederReading,
    GarduInduk,
    Penyulang,
    Trafo,
    db,
)
from ..nkwh_excel import analyze_workbook, parse_exim_rows, parse_nkwh_feeders
from .monthly_workflow import ensure_period_writable, mark_period_uploaded, workflow_payload


UPLOAD_EVENTS = defaultdict(deque)


class UploadImportError(ValueError):
    """Expected upload/import failure that should be returned as JSON."""

    def __init__(self, message, status_code=400, payload=None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {"error": message}


def _config_set(key, default):
    value = current_app.config.get(key, default)
    if isinstance(value, str):
        return {part.strip().lower() for part in value.split(",") if part.strip()}
    return {str(part).lower() for part in value}


def _generic_upload_extensions():
    return _config_set("ALLOWED_GENERIC_UPLOADS", ALLOWED_GENERIC_UPLOADS)


def _nkwh_upload_extensions():
    return _config_set("ALLOWED_NKWH_UPLOADS", ALLOWED_NKWH_UPLOADS)


def _max_import_rows():
    return int(current_app.config["MAX_IMPORT_ROWS"])


def _max_content_length():
    return int(current_app.config["MAX_CONTENT_LENGTH"])


def _upload_rate_limit():
    return int(current_app.config["UPLOAD_RATE_LIMIT"])


def _upload_rate_window_minutes():
    return int(current_app.config["UPLOAD_RATE_WINDOW_MINUTES"])


def _prune_events(events, window_minutes):
    cutoff = datetime.utcnow() - timedelta(minutes=window_minutes)
    while events and events[0] < cutoff:
        events.popleft()


def _rate_limited(bucket, key, limit, window_minutes):
    events = bucket[key]
    _prune_events(events, window_minutes)
    return len(events) >= limit


def _record_rate_event(bucket, key, window_minutes):
    events = bucket[key]
    _prune_events(events, window_minutes)
    events.append(datetime.utcnow())


def _upload_rate_key():
    user = getattr(g, "current_user", None)
    return f'{user.id if user else "anon"}:{client_ip()}'


def _check_upload_rate():
    key = _upload_rate_key()
    window = _upload_rate_window_minutes()
    if _rate_limited(UPLOAD_EVENTS, key, _upload_rate_limit(), window):
        raise UploadImportError("Terlalu banyak upload dalam waktu singkat. Coba lagi beberapa menit lagi.")
    _record_rate_event(UPLOAD_EVENTS, key, window)


def _extension(filename):
    return secure_filename(filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""


def _validate_upload_file(file: FileStorage, allowed_extensions, content_length=None):
    filename = secure_filename(file.filename or "")
    ext = _extension(filename)
    if not filename:
        raise UploadImportError("Nama file kosong.")
    if ext not in allowed_extensions:
        allowed = ", ".join(sorted(allowed_extensions))
        raise UploadImportError(f"Format file tidak diizinkan. Gunakan: {allowed}.")
    if content_length and content_length > _max_content_length():
        max_mb = _max_content_length() // (1024 * 1024)
        raise UploadImportError(f"Ukuran file melebihi batas {max_mb} MB.")

    pos = file.stream.tell()
    head = file.stream.read(8)
    file.stream.seek(pos)
    if ext in {"xlsx", "xlsm"} and not head.startswith(b"PK"):
        raise UploadImportError("File Excel tidak valid atau rusak.")
    if ext == "xls" and head != XLS_SIGNATURE:
        raise UploadImportError("File XLS tidak valid atau rusak.")
    return filename, ext


def _norm_col(value):
    return "".join(ch for ch in str(value).strip().lower() if ch.isalnum())


def _pick(row, aliases, default=None):
    for alias in aliases:
        key = _norm_col(alias)
        if key in row and pd.notna(row[key]) and str(row[key]).strip() != "":
            return row[key]
    return default


def _num(value, default=0):
    if value is None or pd.isna(value) or str(value).strip() == "":
        return default
    text_value = str(value).replace(".", "").replace(",", ".") if isinstance(value, str) else value
    try:
        return float(text_value)
    except (TypeError, ValueError):
        return default


def _str_value(value, default=""):
    if value is None or pd.isna(value):
        return default
    return str(value).strip()


def month_date(value, fallback=None):
    if value is None or pd.isna(value) or str(value).strip() == "":
        if fallback:
            year, month = fallback.split("-")[:2]
            return date(int(year), int(month), 1)
        raise UploadImportError("Kolom bulan/periode wajib diisi")
    if hasattr(value, "year") and hasattr(value, "month"):
        return date(int(value.year), int(value.month), 1)
    raw = str(value).strip()
    if len(raw) == 7 and raw[4] == "-":
        return date(int(raw[:4]), int(raw[5:7]), 1)
    parsed = pd.to_datetime(raw, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        raise UploadImportError(f"Format bulan tidak dikenali: {raw}")
    return date(int(parsed.year), int(parsed.month), 1)


def _previous_month(period):
    return date(period.year - 1, 12, 1) if period.month == 1 else date(period.year, period.month - 1, 1)


def _read_upload_table(file: FileStorage, content_length=None):
    safe_filename, ext = _validate_upload_file(file, _generic_upload_extensions(), content_length)
    file.stream.seek(0)
    if ext in {"xlsx", "xlsm", "xls"}:
        frame = pd.read_excel(file.stream)
    elif ext == "csv":
        frame = pd.read_csv(file.stream)
    else:
        raise UploadImportError("Format file harus CSV atau Excel (.xlsx/.xls)")
    frame = frame.dropna(how="all")
    if len(frame) > _max_import_rows():
        raise UploadImportError(f"Jumlah baris melebihi batas {_max_import_rows()}.")
    frame.columns = [_norm_col(col) for col in frame.columns]
    return safe_filename, frame


def _find_or_create_gi(row, default_gi_id):
    if default_gi_id:
        gi = db.session.get(GarduInduk, default_gi_id)
        if gi:
            return gi
    kode = _str_value(_pick(row, ["kode_gi", "kode gardu induk", "gi"]), "")
    nama = _str_value(_pick(row, ["nama_gi", "gardu_induk", "gardu induk", "nama gardu induk"]), kode)
    if not kode and not nama:
        raise UploadImportError("GI tidak ditemukan. Isi kode_gi/nama_gi atau pilih default GI.")
    gi = GarduInduk.query.filter((GarduInduk.kode_gi == kode) | (GarduInduk.nama_gi == nama)).first()
    if gi:
        return gi
    gi = GarduInduk(kode_gi=kode or nama[:20].upper(), nama_gi=nama or kode, aktif=True)
    db.session.add(gi)
    db.session.flush()
    return gi


def _find_or_create_trafo(row, gi, default_trafo_id):
    if default_trafo_id:
        trafo = db.session.get(Trafo, default_trafo_id)
        if trafo:
            return trafo
    kode = _str_value(_pick(row, ["kode_trafo", "trafo", "kode trafo"]), "")
    nama = _str_value(_pick(row, ["nama_trafo", "nama trafo"]), kode or "Trafo 1")
    if not kode:
        kode = "TRF-1"
    trafo = Trafo.query.filter_by(gi_id=gi.id, kode_trafo=kode).first()
    if trafo:
        return trafo
    trafo = Trafo(
        gi_id=gi.id,
        kode_trafo=kode,
        nama_trafo=nama or kode,
        kapasitas_mva=Decimal("0"),
        tegangan_kv=Decimal("20"),
        aktif=True,
    )
    db.session.add(trafo)
    db.session.flush()
    return trafo


def _find_or_create_penyulang(row, gi, trafo):
    kode = _str_value(_pick(row, ["kode_penyulang", "kode penyulang", "kode", "penyulang"]), "")
    nama = _str_value(_pick(row, ["nama_penyulang", "nama penyulang", "nama", "feeder"]), kode)
    if not kode:
        raise UploadImportError("kode_penyulang wajib diisi")
    penyulang = Penyulang.query.filter_by(trafo_id=trafo.id, kode_penyulang=kode).first()
    if not penyulang:
        penyulang = Penyulang(
            trafo_id=trafo.id,
            gi_id=gi.id,
            kode_penyulang=kode,
            nama_penyulang=nama or kode,
            aktif=True,
        )
        db.session.add(penyulang)
    penyulang.nama_penyulang = nama or penyulang.nama_penyulang
    penyulang.jenis = _str_value(
        _pick(row, ["jenis", "jenis_penyulang"], penyulang.jenis or "REGULAR"),
        "REGULAR",
    ).upper()
    penyulang.area_up3 = _str_value(
        _pick(row, ["area_up3", "area", "up3", "area up3"], penyulang.area_up3),
        penyulang.area_up3,
    )
    penyulang.ex_cabang = _str_value(
        _pick(row, ["ex_cabang", "ex cabang", "cabang"], penyulang.ex_cabang),
        penyulang.ex_cabang,
    )
    penyulang.status = _str_value(
        _pick(row, ["status", "status_penyulang", "status penyulang"], penyulang.status or "AKTIF"),
        "AKTIF",
    ).upper()
    penyulang.aktif = penyulang.status not in {"NONAKTIF", "OFF", "PADAM PERMANEN"}
    db.session.flush()
    return penyulang


def _reading_values(row):
    faktor = _num(_pick(row, ["faktor_kali", "faktor", "fk"]), 1) or 1
    stand_awal = _num(_pick(row, ["stand_awal", "stand awal", "awal"]), 0)
    stand_akhir = _num(_pick(row, ["stand_akhir", "stand akhir", "akhir"]), 0)
    wbp = _num(_pick(row, ["kwh_wbp", "wbp"]), 0)
    lwbp1 = _num(_pick(row, ["kwh_lwbp1", "lwbp1", "lwbp", "lwbp_1"]), 0)
    lwbp2 = _num(_pick(row, ["kwh_lwbp2", "lwbp2", "lwbp_2"]), 0)
    total = _num(_pick(row, ["kwh_total", "total_kwh", "total kwh", "total"]), 0)

    if stand_akhir and faktor and not any([wbp, lwbp1, lwbp2, total]):
        total = max(0, (stand_akhir - stand_awal) * faktor)
        wbp, lwbp1, lwbp2 = total, 0, 0
    elif total and not any([wbp, lwbp1, lwbp2]):
        wbp, lwbp1, lwbp2 = total, 0, 0
    else:
        total = wbp + lwbp1 + lwbp2

    return stand_awal, stand_akhir, faktor, wbp, lwbp1, lwbp2, total


def _set_anomaly(reading, threshold_pct, min_delta):
    previous = FeederReading.query.filter_by(
        penyulang_id=reading.penyulang_id,
        periode_bulan=_previous_month(reading.periode_bulan),
    ).first()
    reading.flag_alert = False
    reading.deviasi_persen = Decimal("0")
    reading.anomaly_type = None
    reading.catatan = None
    if not previous or previous.kwh_total <= 0:
        return
    delta = reading.kwh_total - previous.kwh_total
    pct = (delta / previous.kwh_total) * 100
    if abs(delta) >= min_delta and abs(pct) >= threshold_pct:
        reading.flag_alert = True
        reading.deviasi_persen = Decimal(str(round(pct, 2)))
        reading.anomaly_type = "NAIK" if delta > 0 else "TURUN"
        reading.catatan = (
            f"Anomali {reading.anomaly_type.lower()} {round(pct, 2)}% "
            f"dari bulan sebelumnya ({round(previous.kwh_total)} ke {round(reading.kwh_total)} kWh)."
        )


def _slug_code(value, fallback="DATA", max_len=30):
    raw = _str_value(value, fallback).upper()
    code = "".join(ch if ch.isalnum() else "-" for ch in raw)
    code = "-".join(part for part in code.split("-") if part)
    return (code or fallback)[:max_len]


def _decimal_or_none(value):
    if value is None:
        return None
    return Decimal(str(value))


def _decimal_or_zero(value):
    return Decimal(str(value or 0))


def _nkwh_period(value, fallback=None):
    if value:
        return date.fromisoformat(value)
    if fallback:
        return month_date(fallback)
    raise UploadImportError("Periode bulan tidak ditemukan dari workbook. Isi default bulan saat import.")


def _find_or_create_gi_from_name(name):
    nama = _str_value(name, "Belum Dipetakan")
    kode = _slug_code(nama, "GI", 20)
    gi = GarduInduk.query.filter((GarduInduk.kode_gi == kode) | (GarduInduk.nama_gi == nama)).first()
    if gi:
        return gi
    gi = GarduInduk(kode_gi=kode, nama_gi=nama, aktif=True)
    db.session.add(gi)
    db.session.flush()
    return gi


def _find_or_create_trafo_from_nkwh(gi, kode_trafo, nama_trafo):
    raw = _str_value(kode_trafo, "TRF-1")
    raw_upper = raw.upper()
    kode = raw_upper if raw_upper.startswith("TRF") else f"TRF-{raw_upper}"
    candidates = {raw_upper, kode, f"{gi.kode_gi}-T{raw_upper}", f"{gi.kode_gi}-{kode}"}
    trafo = Trafo.query.filter(Trafo.gi_id == gi.id, Trafo.kode_trafo.in_(candidates)).first()
    if not trafo:
        trafo = Trafo.query.filter(
            Trafo.gi_id == gi.id,
            Trafo.nama_trafo.in_({_str_value(nama_trafo, kode), f"Trafo {raw}"}),
        ).first()
    if trafo:
        return trafo
    trafo = Trafo(
        gi_id=gi.id,
        kode_trafo=kode,
        nama_trafo=_str_value(nama_trafo, kode),
        kapasitas_mva=Decimal("0"),
        tegangan_kv=Decimal("20"),
        aktif=True,
    )
    db.session.add(trafo)
    db.session.flush()
    return trafo


def _find_or_create_penyulang_from_nkwh(item, gi, trafo):
    kode = _slug_code(item.get("kode_penyulang") or item.get("nama_penyulang"), "PENYULANG", 30)
    nama = _str_value(item.get("nama_penyulang"), kode)
    penyulang = Penyulang.query.filter_by(trafo_id=trafo.id, kode_penyulang=kode).first()
    if not penyulang:
        penyulang = Penyulang.query.filter_by(trafo_id=trafo.id, nama_penyulang=nama).first()
    if not penyulang:
        penyulang = Penyulang(
            trafo_id=trafo.id,
            gi_id=gi.id,
            kode_penyulang=kode,
            nama_penyulang=nama,
            jenis="REGULAR",
            status="AKTIF",
            aktif=True,
        )
        db.session.add(penyulang)
    penyulang.gi_id = gi.id
    penyulang.nama_penyulang = nama or penyulang.nama_penyulang
    penyulang.status = penyulang.status or "AKTIF"
    penyulang.aktif = penyulang.status not in {"NONAKTIF", "OFF", "PADAM PERMANEN"}
    db.session.flush()
    return penyulang


def _apply_nkwh_registers(reading, item):
    registers = item.get("registers") or {}
    for prefix in ("wbp", "lwbp1", "lwbp2"):
        detail = registers.get(prefix, {})
        setattr(reading, f"{prefix}_stand_awal", _decimal_or_none(detail.get("stand_awal")))
        setattr(reading, f"{prefix}_stand_akhir", _decimal_or_none(detail.get("stand_akhir")))
        setattr(reading, f"{prefix}_faktor_kali", _decimal_or_none(detail.get("faktor_kali")))

    first_register = next((registers[key] for key in ("wbp", "lwbp1", "lwbp2") if key in registers), {})
    reading.stand_awal = _decimal_or_none(first_register.get("stand_awal"))
    reading.stand_akhir = _decimal_or_none(first_register.get("stand_akhir"))
    reading.faktor_kali = _decimal_or_none(first_register.get("faktor_kali")) or Decimal("1")

    reading.kwh_wbp = _decimal_or_zero(item.get("kwh_wbp"))
    reading.kwh_lwbp1 = _decimal_or_zero(item.get("kwh_lwbp1"))
    reading.kwh_lwbp2 = _decimal_or_zero(item.get("kwh_lwbp2"))
    reading.manual_kwh_wbp = _decimal_or_none(item.get("manual_kwh_wbp"))
    reading.manual_kwh_lwbp1 = _decimal_or_none(item.get("manual_kwh_lwbp1"))
    reading.manual_kwh_lwbp2 = _decimal_or_none(item.get("manual_kwh_lwbp2"))
    reading.source_format = "NKWH_XLSX"
    reading.source_sheet = item.get("source_sheet")
    reading.source_row_start = item.get("source_row_start")
    reading.source_row_end = item.get("source_row_end")


def _import_nkwh_exim_rows(exim_rows, period):
    imported = updated = 0
    for row in exim_rows:
        kode_rule = _slug_code(
            f"{row.get('gardu_induk')}-{row.get('feeder')}-{row.get('row')}",
            "EXIM",
            60,
        )
        rule = EximRule.query.filter_by(kode_rule=kode_rule).first()
        if rule:
            updated += 1
        else:
            imported += 1
            rule = EximRule(kode_rule=kode_rule)
            db.session.add(rule)

        rule.nama_rule = _str_value(row.get("feeder"), kode_rule)
        rule.metode = row.get("metode") or "ADJUSTMENT"
        rule.up3_asal = row.get("area_asal") or None
        rule.up3_tujuan = row.get("area_tujuan") or None
        rule.fungsi = row.get("fungsi") or None
        rule.arah = row.get("arah") or None
        rule.periode_mulai = period
        rule.source_sheet = "Exim"
        rule.source_row = row.get("row")
        rule.catatan = row.get("jenis") or row.get("lokasi")
        db.session.flush()

        result = EximMonthlyResult.query.filter_by(
            rule_id=rule.id,
            periode_bulan=period,
            up3_tujuan=rule.up3_tujuan,
        ).first()
        if not result:
            result = EximMonthlyResult(rule_id=rule.id, periode_bulan=period)
            db.session.add(result)

        basis = row.get("kwh_penyulang_basis") or 0
        transfer = row.get("kwh_total") or sum(
            [
                row.get("kwh_wbp") or 0,
                row.get("kwh_lwbp1") or 0,
                row.get("kwh_lwbp2") or 0,
            ]
        )
        result.metode = rule.metode
        result.up3_asal = rule.up3_asal
        result.up3_tujuan = rule.up3_tujuan
        result.fungsi = rule.fungsi
        result.arah = rule.arah
        result.kwh_basis = _decimal_or_zero(basis)
        result.kwh_wbp = _decimal_or_zero(row.get("kwh_wbp"))
        result.kwh_lwbp1 = _decimal_or_zero(row.get("kwh_lwbp1"))
        result.kwh_lwbp2 = _decimal_or_zero(row.get("kwh_lwbp2"))
        result.kwh_transfer = _decimal_or_zero(transfer)
        result.porsi = _decimal_or_none(transfer / basis) if basis else None
        result.source_sheet = "Exim"
        result.source_row = row.get("row")
        result.catatan = row.get("lokasi")
    return imported, updated


def _nkwh_import_blockers(parsed):
    blockers = []
    if not parsed.get("feeder_count"):
        blockers.append("Tidak ada data penyulang yang bisa diimport.")
    return blockers


def _audit_failure(action, filename, error):
    safe_commit_audit(
        action,
        detail={"filename": filename, "error": str(error)},
        status="FAILED",
    )


def validate_generic_upload(file: FileStorage, content_length=None):
    _check_upload_rate()
    _validate_upload_file(file, _generic_upload_extensions(), content_length)
    return {"message": "Upload endpoint aktif. Integrasi UploadEngine belum selesai."}


def analyze_nkwh_upload(file: FileStorage, default_bulan="", content_length=None):
    filename = file.filename
    try:
        _check_upload_rate()
        safe_filename, _ = _validate_upload_file(file, _nkwh_upload_extensions(), content_length)
        filename = safe_filename
        file.stream.seek(0)
        result = analyze_workbook(file.stream)
        feeder_count = result.get("kwh_penyulang", {}).get("feeder_count", 0)
        if feeder_count > _max_import_rows():
            raise UploadImportError(f"Jumlah data penyulang melebihi batas {_max_import_rows()}.")

        result["filename"] = safe_filename
        period_value = result.get("periode_bulan") or default_bulan
        if period_value:
            period = month_date(period_value)
            result["workflow"] = workflow_payload(period)

        audit(
            "ANALYZE_NKWH",
            entity_type="upload",
            detail={
                "filename": safe_filename,
                "periode_bulan": result.get("periode_bulan"),
                "feeder_count": feeder_count,
                "exim_rows": result.get("exim", {}).get("row_count"),
            },
        )
        db.session.commit()
        return result
    except UploadImportError as exc:
        db.session.rollback()
        _audit_failure("ANALYZE_NKWH", filename, exc)
        raise
    except ValueError as exc:
        db.session.rollback()
        _audit_failure("ANALYZE_NKWH", filename, exc)
        raise UploadImportError(str(exc)) from exc
    except Exception as exc:
        db.session.rollback()
        _audit_failure("ANALYZE_NKWH", filename, exc)
        raise


def import_nkwh_upload(
    file: FileStorage,
    *,
    threshold_pct=25,
    min_delta=10000,
    default_bulan="",
    import_exim=True,
    content_length=None,
):
    filename = file.filename
    try:
        _check_upload_rate()
        safe_filename, _ = _validate_upload_file(file, _nkwh_upload_extensions(), content_length)
        filename = safe_filename
        file.stream.seek(0)
        parsed = parse_nkwh_feeders(file.stream)
        if parsed.get("feeder_count", 0) > _max_import_rows():
            raise UploadImportError(f"Jumlah data penyulang melebihi batas {_max_import_rows()}.")
        blockers = _nkwh_import_blockers(parsed)
        if blockers:
            raise UploadImportError(
                "Import dibatalkan karena validasi gagal.",
                payload={"error": "Import dibatalkan karena validasi gagal.", "errors": blockers},
            )

        period = _nkwh_period(parsed.get("periode_bulan"), default_bulan or None)
        ensure_period_writable(period)
        created = updated = alerts = 0

        for item in parsed.get("feeders", []):
            gi = _find_or_create_gi_from_name(item.get("gardu_induk"))
            trafo = _find_or_create_trafo_from_nkwh(gi, item.get("kode_trafo"), item.get("nama_trafo"))
            penyulang = _find_or_create_penyulang_from_nkwh(item, gi, trafo)

            reading = FeederReading.query.filter_by(
                penyulang_id=penyulang.id,
                periode_bulan=period,
            ).first()
            if reading:
                updated += 1
            else:
                created += 1
                reading = FeederReading(penyulang_id=penyulang.id, periode_bulan=period)
                db.session.add(reading)

            reading.trafo_id = trafo.id
            reading.gi_id = gi.id
            _apply_nkwh_registers(reading, item)
            db.session.flush()
            _set_anomaly(reading, threshold_pct, min_delta)
            if reading.flag_alert:
                alerts += 1

        exim_created = exim_updated = 0
        if import_exim:
            file.stream.seek(0)
            exim = parse_exim_rows(file.stream)
            exim_created, exim_updated = _import_nkwh_exim_rows(exim.get("rows", []), period)

        workflow_record = mark_period_uploaded(period, "NKWH", safe_filename)
        audit(
            "IMPORT_NKWH",
            entity_type="upload",
            detail={
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
            },
        )
        db.session.commit()
        return {
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
            "workflow": workflow_payload(period, workflow_record),
        }
    except UploadImportError as exc:
        db.session.rollback()
        _audit_failure("IMPORT_NKWH", filename, exc)
        raise
    except ValueError as exc:
        db.session.rollback()
        _audit_failure("IMPORT_NKWH", filename, exc)
        raise UploadImportError(str(exc)) from exc
    except Exception as exc:
        db.session.rollback()
        _audit_failure("IMPORT_NKWH", filename, exc)
        raise


def import_penyulang_upload(
    file: FileStorage,
    *,
    default_gi_id=None,
    default_trafo_id=None,
    default_bulan="",
    threshold_pct=25,
    min_delta=10000,
    content_length=None,
):
    filename = file.filename
    try:
        _check_upload_rate()
        safe_filename, frame = _read_upload_table(file, content_length)
        filename = safe_filename
        created = updated = alerts = 0
        errors = []
        checked_periods = set()
        imported_periods = {}

        for idx, raw in frame.iterrows():
            row = raw.to_dict()
            try:
                period = month_date(
                    _pick(row, ["bulan", "periode", "periode_bulan", "month"]),
                    default_bulan or None,
                )
                period_key = period.isoformat()
                if period_key not in checked_periods:
                    ensure_period_writable(period)
                    checked_periods.add(period_key)
                gi = _find_or_create_gi(row, default_gi_id)
                trafo = _find_or_create_trafo(row, gi, default_trafo_id)
                penyulang = _find_or_create_penyulang(row, gi, trafo)
                stand_awal, stand_akhir, faktor, wbp, lwbp1, lwbp2, _total = _reading_values(row)

                reading = FeederReading.query.filter_by(
                    penyulang_id=penyulang.id,
                    periode_bulan=period,
                ).first()
                if reading:
                    updated += 1
                else:
                    created += 1
                    reading = FeederReading(
                        penyulang_id=penyulang.id,
                        trafo_id=trafo.id,
                        gi_id=gi.id,
                        periode_bulan=period,
                    )
                    db.session.add(reading)

                reading.trafo_id = trafo.id
                reading.gi_id = gi.id
                reading.stand_awal = Decimal(str(stand_awal))
                reading.stand_akhir = Decimal(str(stand_akhir))
                reading.faktor_kali = Decimal(str(faktor))
                reading.kwh_wbp = Decimal(str(wbp))
                reading.kwh_lwbp1 = Decimal(str(lwbp1))
                reading.kwh_lwbp2 = Decimal(str(lwbp2))
                db.session.flush()
                _set_anomaly(reading, threshold_pct, min_delta)
                if reading.flag_alert:
                    alerts += 1
                imported_periods[period_key] = period
            except Exception as row_error:
                errors.append({"baris": int(idx) + 2, "error": str(row_error)})

        if errors and not (created or updated):
            db.session.rollback()
            safe_commit_audit(
                "IMPORT_PENYULANG",
                detail={"filename": safe_filename, "errors": errors[:10]},
                status="FAILED",
            )
            raise UploadImportError(
                "Upload gagal. Tidak ada baris valid.",
                payload={"error": "Upload gagal. Tidak ada baris valid.", "errors": errors[:10]},
            )

        workflow_rows = []
        for period in imported_periods.values():
            record = mark_period_uploaded(period, "PENYULANG", safe_filename)
            workflow_rows.append(workflow_payload(period, record))

        audit(
            "IMPORT_PENYULANG",
            entity_type="upload",
            detail={
                "filename": safe_filename,
                "created": created,
                "updated": updated,
                "alerts": alerts,
                "error_count": len(errors),
                "periods": sorted(imported_periods),
            },
        )
        db.session.commit()
        return {
            "message": "Upload penyulang selesai",
            "created": created,
            "updated": updated,
            "alerts": alerts,
            "errors": errors[:10],
            "error_count": len(errors),
            "workflow": workflow_rows,
        }
    except UploadImportError as exc:
        if db.session.is_active:
            db.session.rollback()
        if not exc.payload.get("errors"):
            _audit_failure("IMPORT_PENYULANG", filename, exc)
        raise
    except ValueError as exc:
        db.session.rollback()
        _audit_failure("IMPORT_PENYULANG", filename, exc)
        raise UploadImportError(str(exc)) from exc
    except Exception as exc:
        db.session.rollback()
        _audit_failure("IMPORT_PENYULANG", filename, exc)
        raise
