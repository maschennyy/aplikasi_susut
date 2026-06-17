"""Dashboard aggregation services."""

from __future__ import annotations

from sqlalchemy import func

from ..models import FeederReading, MeterReading, db


def get_dashboard_data(*, year: int | None = None) -> dict:
    """Return monthly MU, feeder, and loss aggregates for the dashboard."""
    mu_query = db.session.query(
        MeterReading.periode_bulan,
        func.sum(
            func.coalesce(MeterReading.mu_kwh_wbp, 0)
            + func.coalesce(MeterReading.mu_kwh_lwbp1, 0)
            + func.coalesce(MeterReading.mu_kwh_lwbp2, 0)
        ).label("total_mu"),
    ).group_by(MeterReading.periode_bulan)

    feeder_query = db.session.query(
        FeederReading.periode_bulan,
        func.sum(
            func.coalesce(FeederReading.kwh_wbp, 0)
            + func.coalesce(FeederReading.kwh_lwbp1, 0)
            + func.coalesce(FeederReading.kwh_lwbp2, 0)
        ).label("total_penyulang"),
    ).group_by(FeederReading.periode_bulan)

    if year:
        mu_query = mu_query.filter(
            func.extract("year", MeterReading.periode_bulan) == year
        )
        feeder_query = feeder_query.filter(
            func.extract("year", FeederReading.periode_bulan) == year
        )

    mu_subquery = mu_query.subquery()
    feeder_subquery = feeder_query.subquery()

    rows = (
        db.session.query(
            mu_subquery.c.periode_bulan,
            mu_subquery.c.total_mu,
            func.coalesce(
                feeder_subquery.c.total_penyulang,
                0,
            ).label("total_penyulang"),
        )
        .outerjoin(
            feeder_subquery,
            mu_subquery.c.periode_bulan == feeder_subquery.c.periode_bulan,
        )
        .order_by(mu_subquery.c.periode_bulan)
        .all()
    )

    monthly_data: list[dict] = []
    total_mu = 0.0
    total_feeder = 0.0

    for row in rows:
        mu_value = float(row.total_mu or 0)
        feeder_value = float(row.total_penyulang or 0)
        loss_kwh = mu_value - feeder_value
        loss_percentage = round(loss_kwh / mu_value * 100, 2) if mu_value > 0 else 0

        total_mu += mu_value
        total_feeder += feeder_value
        monthly_data.append({
            "tanggal": row.periode_bulan.strftime("%Y-%m-%d"),
            "meter_utama": mu_value,
            "total_penyulang": feeder_value,
            "susut_kwh": round(loss_kwh, 2),
            "persentase_susut": loss_percentage,
        })

    total_loss = total_mu - total_feeder
    total_percentage = round(total_loss / total_mu * 100, 2) if total_mu > 0 else 0

    return {
        "data_bulanan": monthly_data,
        "total": {
            "meter_utama": total_mu,
            "total_penyulang": total_feeder,
            "total_susut": round(total_loss, 2),
            "persentase_total": total_percentage,
        },
    }
