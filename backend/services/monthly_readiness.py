"""Monthly data completeness and finalization readiness service."""

from sqlalchemy import func

from ..models import (
    EximMonthlyResult,
    FeederReading,
    GarduInduk,
    MeterReading,
    Penyulang,
    RekapBulanan,
    Trafo,
    TransferAntarUnit,
    db,
)


def _readiness_status(value, expected=None, optional=False):
    if expected and expected > 0:
        ratio = min(float(value or 0) / float(expected), 1)
    else:
        ratio = 1 if value else 0
    if ratio >= 0.98:
        return "ready", ratio
    if ratio > 0:
        return "partial", ratio
    return ("optional" if optional else "empty"), ratio


def _readiness_item(code, label, value, expected=None, optional=False, detail=""):
    status, ratio = _readiness_status(value, expected, optional)
    if expected and expected > 0:
        subtitle = f"{int(value or 0)} dari {int(expected)}"
    else:
        subtitle = f"{int(value or 0)} data"
    return {
        "code": code,
        "label": label,
        "value": int(value or 0),
        "expected": int(expected) if expected is not None else None,
        "ratio": round(ratio, 4),
        "percent": round(ratio * 100),
        "status": status,
        "optional": optional,
        "subtitle": subtitle,
        "detail": detail,
    }


def readiness_payload(period):
    active_gi = GarduInduk.query.filter_by(aktif=True).count()
    active_trafo = Trafo.query.filter_by(aktif=True).count()
    active_feeders = Penyulang.query.filter_by(aktif=True).count()

    feeder_rows = FeederReading.query.filter_by(periode_bulan=period).count()
    feeder_unique = db.session.query(
        func.count(func.distinct(FeederReading.penyulang_id))
    ).filter(FeederReading.periode_bulan == period).scalar() or 0
    alert_count = FeederReading.query.filter_by(
        periode_bulan=period,
        flag_alert=True,
    ).count()

    mu_total_expr = (
        func.coalesce(MeterReading.mu_kwh_wbp, 0)
        + func.coalesce(MeterReading.mu_kwh_lwbp1, 0)
        + func.coalesce(MeterReading.mu_kwh_lwbp2, 0)
    )
    mp_total_expr = (
        func.coalesce(MeterReading.mp_kwh_wbp, 0)
        + func.coalesce(MeterReading.mp_kwh_lwbp1, 0)
        + func.coalesce(MeterReading.mp_kwh_lwbp2, 0)
    )
    mu_count = MeterReading.query.filter(
        MeterReading.periode_bulan == period,
        mu_total_expr > 0,
    ).count()
    mp_count = MeterReading.query.filter(
        MeterReading.periode_bulan == period,
        mp_total_expr > 0,
    ).count()
    exim_count = EximMonthlyResult.query.filter_by(periode_bulan=period).count()
    transfer_count = TransferAntarUnit.query.filter_by(periode_bulan=period).count()
    rekap_count = RekapBulanan.query.filter_by(periode_bulan=period).count()

    items = [
        _readiness_item("master_gi", "Master GI", active_gi, detail="gardu induk aktif"),
        _readiness_item("master_trafo", "Master Trafo", active_trafo, detail="trafo aktif"),
        _readiness_item("master_penyulang", "Master Penyulang", active_feeders, detail="penyulang aktif"),
        _readiness_item(
            "feeder_reading",
            "kWh Penyulang",
            feeder_unique,
            active_feeders,
            detail=f"{feeder_rows} baris pembacaan",
        ),
        _readiness_item("meter_utama", "kWh Utama", mu_count, active_trafo, detail="trafo punya meter utama"),
        _readiness_item(
            "meter_pembanding",
            "kWh Pembanding",
            mp_count,
            active_trafo,
            detail="trafo punya meter pembanding",
        ),
        _readiness_item("exim", "Transfer EXIM", exim_count, optional=True, detail="snapshot transfer EXIM"),
        _readiness_item(
            "transfer_uid",
            "Transfer Antar UID",
            transfer_count,
            optional=True,
            detail="transaksi antar UID",
        ),
        _readiness_item("rekap", "Rekap Bulanan", rekap_count, optional=True, detail="snapshot rekap"),
    ]

    required = [item for item in items if not item["optional"]]
    score = round(sum(item["ratio"] for item in required) / len(required) * 100) if required else 0
    blockers = [
        item["label"]
        for item in required
        if item["status"] in {"empty", "partial"}
    ]
    return {
        "periode": period.strftime("%Y-%m"),
        "periode_bulan": period.strftime("%Y-%m-%d"),
        "score": score,
        "status": "ready" if not blockers else "partial" if score else "empty",
        "can_finalize": not blockers,
        "blockers": blockers,
        "alert_count": alert_count,
        "items": items,
    }
