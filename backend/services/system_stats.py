"""Read-only system statistics used by lightweight UI endpoints."""

from __future__ import annotations

from datetime import date

from ..models import FeederReading, GarduInduk


def get_sidebar_stats(*, today: date | None = None) -> dict[str, int]:
    """Return active GI and current-month feeder alert counts."""
    current_month = (today or date.today()).replace(day=1)

    return {
        "gi_aktif": GarduInduk.query.filter_by(aktif=True).count(),
        "alert_count": FeederReading.query.filter_by(
            flag_alert=True,
            periode_bulan=current_month,
        ).count(),
    }
