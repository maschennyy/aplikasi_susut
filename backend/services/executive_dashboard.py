"""Executive dashboard aggregation service."""

from __future__ import annotations

from datetime import date
from typing import Callable

from sqlalchemy import func

from ..models import FeederReading, GarduInduk, MeterReading, Penyulang, Trafo, db


PayloadProvider = Callable[[date], dict]


def _kwh_sum(*columns):
    expression = 0
    for column in columns:
        expression += func.coalesce(column, 0)
    return expression


def _float_value(value) -> float:
    return float(value or 0)


def get_executive_dashboard(
    *,
    period: date,
    readiness_provider: PayloadProvider,
    workflow_provider: PayloadProvider,
) -> dict:
    """Build executive totals, GI deviations, anomalies, and period status."""
    mu_expression = _kwh_sum(
        MeterReading.mu_kwh_wbp,
        MeterReading.mu_kwh_lwbp1,
        MeterReading.mu_kwh_lwbp2,
    )
    feeder_expression = _kwh_sum(
        FeederReading.kwh_wbp,
        FeederReading.kwh_lwbp1,
        FeederReading.kwh_lwbp2,
    )

    total_incoming = _float_value(
        db.session.query(func.sum(mu_expression))
        .filter(MeterReading.periode_bulan == period)
        .scalar()
    )
    total_outgoing = _float_value(
        db.session.query(func.sum(feeder_expression))
        .filter(FeederReading.periode_bulan == period)
        .scalar()
    )
    loss_kwh = total_incoming - total_outgoing
    loss_percentage = (
        loss_kwh / total_incoming * 100
        if total_incoming
        else 0
    )

    mu_rows = (
        db.session.query(
            MeterReading.gi_id,
            func.sum(mu_expression).label("total_mu"),
        )
        .filter(MeterReading.periode_bulan == period)
        .group_by(MeterReading.gi_id)
        .all()
    )
    feeder_rows = (
        db.session.query(
            FeederReading.gi_id,
            func.sum(feeder_expression).label("total_feeder"),
        )
        .filter(FeederReading.periode_bulan == period)
        .group_by(FeederReading.gi_id)
        .all()
    )

    gi_names = {
        gi.id: gi.nama_gi
        for gi in GarduInduk.query.filter_by(aktif=True).all()
    }
    mu_by_gi = {
        row.gi_id: _float_value(row.total_mu)
        for row in mu_rows
    }
    feeder_by_gi = {
        row.gi_id: _float_value(row.total_feeder)
        for row in feeder_rows
    }

    gi_deviations = []
    for gi_id in sorted(set(mu_by_gi) | set(feeder_by_gi)):
        mu_value = mu_by_gi.get(gi_id, 0)
        feeder_value = feeder_by_gi.get(gi_id, 0)
        gap = mu_value - feeder_value
        gi_deviations.append({
            "gi_id": gi_id,
            "nama_gi": gi_names.get(gi_id, f"GI #{gi_id}"),
            "meter_utama": round(mu_value, 2),
            "penyulang": round(feeder_value, 2),
            "deviasi_kwh": round(gap, 2),
            "deviasi_persen": round(
                gap / mu_value * 100 if mu_value else 0,
                2,
            ),
        })
    gi_deviations.sort(
        key=lambda row: abs(row["deviasi_persen"]),
        reverse=True,
    )

    anomaly_rows = (
        db.session.query(
            FeederReading,
            Penyulang,
            Trafo,
            GarduInduk,
        )
        .join(
            Penyulang,
            FeederReading.penyulang_id == Penyulang.id,
        )
        .join(
            Trafo,
            FeederReading.trafo_id == Trafo.id,
        )
        .join(
            GarduInduk,
            FeederReading.gi_id == GarduInduk.id,
        )
        .filter(FeederReading.periode_bulan == period)
        .all()
    )

    anomalies = []
    for reading, penyulang, trafo, gi in anomaly_rows:
        percentage = _float_value(reading.deviasi_persen)
        if not reading.flag_alert and abs(percentage) < 20:
            continue

        anomalies.append({
            "penyulang": penyulang.nama_penyulang,
            "kode_penyulang": penyulang.kode_penyulang,
            "gardu_induk": gi.nama_gi,
            "trafo": trafo.kode_trafo,
            "area_up3": penyulang.area_up3 or "Belum Dipetakan",
            "kwh_total": round(reading.kwh_total, 2),
            "deviasi_persen": round(percentage, 2),
            "anomaly_type": reading.anomaly_type or (
                "Naik/Turun Tidak Wajar"
                if reading.flag_alert
                else "Deviasi Tinggi"
            ),
        })
    anomalies.sort(
        key=lambda row: abs(row["deviasi_persen"]),
        reverse=True,
    )

    return {
        "periode": period.strftime("%Y-%m"),
        "periode_bulan": period.strftime("%Y-%m-%d"),
        "total_kwh_masuk": round(total_incoming, 2),
        "total_kwh_keluar": round(total_outgoing, 2),
        "susut_kwh": round(loss_kwh, 2),
        "susut_persen": round(loss_percentage, 2),
        "gi_deviasi_terbesar": gi_deviations[:5],
        "penyulang_anomali": anomalies[:8],
        "readiness": readiness_provider(period),
        "workflow": workflow_provider(period),
    }
