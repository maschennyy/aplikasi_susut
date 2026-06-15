"""Layanan aturan bisnis aplikasi susut energi."""

from .loss_calculation import (
    LossCalculationInput,
    LossCalculationResult,
    calculate_cumulative_loss_without_emin,
    calculate_monthly_loss_without_emin,
)

__all__ = [
    "LossCalculationInput",
    "LossCalculationResult",
    "calculate_monthly_loss_without_emin",
    "calculate_cumulative_loss_without_emin",
]
