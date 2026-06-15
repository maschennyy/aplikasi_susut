"""Compatibility bridge for the legacy import inside ``backend.app``."""

from backend.nkwh_excel import (
    analyze_workbook,
    parse_nkwh_feeders,
    parse_exim_rows,
)

__all__ = [
    "analyze_workbook",
    "parse_nkwh_feeders",
    "parse_exim_rows",
]
