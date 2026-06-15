"""Perhitungan susut energi bulanan dan kumulatif tanpa EMIN.

Rumus bisnis:
- produksi = kWh utama + kWh terima
- terima netto = produksi - kWh kirim
- siap jual = terima netto - PSSD
- susut tanpa EMIN = siap jual - kWh jual + EMIN
- persentase susut = susut / produksi * 100
"""

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Iterable, Union

NumberLike = Union[int, float, str, Decimal]
ZERO = Decimal("0")
HUNDRED = Decimal("100")


def _decimal(value: NumberLike, name: str) -> Decimal:
    if isinstance(value, bool):
        raise ValueError(f"{name} harus berupa angka.")
    try:
        result = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{name} harus berupa angka yang valid.") from exc
    if not result.is_finite() or result < ZERO:
        raise ValueError(f"{name} harus berupa angka tidak negatif.")
    return result


@dataclass(frozen=True)
class LossCalculationInput:
    kwh_utama: Decimal
    kwh_terima: Decimal = ZERO
    kwh_kirim: Decimal = ZERO
    pssd: Decimal = ZERO
    kwh_jual: Decimal = ZERO
    emin: Decimal = ZERO

    @classmethod
    def create(
        cls,
        *,
        kwh_utama: NumberLike,
        kwh_terima: NumberLike = 0,
        kwh_kirim: NumberLike = 0,
        pssd: NumberLike = 0,
        kwh_jual: NumberLike = 0,
        emin: NumberLike = 0,
    ):
        return cls(
            kwh_utama=_decimal(kwh_utama, "kwh_utama"),
            kwh_terima=_decimal(kwh_terima, "kwh_terima"),
            kwh_kirim=_decimal(kwh_kirim, "kwh_kirim"),
            pssd=_decimal(pssd, "pssd"),
            kwh_jual=_decimal(kwh_jual, "kwh_jual"),
            emin=_decimal(emin, "emin"),
        )


@dataclass(frozen=True)
class LossCalculationResult:
    kwh_utama: Decimal
    kwh_terima: Decimal
    kwh_produksi: Decimal
    kwh_kirim: Decimal
    kwh_terima_netto: Decimal
    pssd: Decimal
    kwh_siap_jual: Decimal
    kwh_jual: Decimal
    emin: Decimal
    susut_tanpa_emin_kwh: Decimal
    susut_tanpa_emin_persen: Decimal

    def to_dict(self):
        return {
            "kwh_utama": float(self.kwh_utama),
            "kwh_terima": float(self.kwh_terima),
            "kwh_produksi": float(self.kwh_produksi),
            "kwh_kirim": float(self.kwh_kirim),
            "kwh_terima_netto": float(self.kwh_terima_netto),
            "pssd": float(self.pssd),
            "kwh_siap_jual": float(self.kwh_siap_jual),
            "kwh_jual": float(self.kwh_jual),
            "emin": float(self.emin),
            "susut_tanpa_emin_kwh": float(self.susut_tanpa_emin_kwh),
            "susut_tanpa_emin_persen": float(self.susut_tanpa_emin_persen),
        }


def calculate_monthly_loss_without_emin(data: LossCalculationInput):
    production = data.kwh_utama + data.kwh_terima
    if data.kwh_kirim > production:
        raise ValueError("kwh_kirim tidak boleh melebihi kwh_produksi.")

    net_received = production - data.kwh_kirim
    if data.pssd > net_received:
        raise ValueError("PSSD tidak boleh melebihi kWh terima netto.")

    ready_to_sell = net_received - data.pssd
    loss_kwh = ready_to_sell - data.kwh_jual + data.emin
    loss_pct = loss_kwh / production * HUNDRED if production > ZERO else ZERO

    return LossCalculationResult(
        kwh_utama=data.kwh_utama,
        kwh_terima=data.kwh_terima,
        kwh_produksi=production,
        kwh_kirim=data.kwh_kirim,
        kwh_terima_netto=net_received,
        pssd=data.pssd,
        kwh_siap_jual=ready_to_sell,
        kwh_jual=data.kwh_jual,
        emin=data.emin,
        susut_tanpa_emin_kwh=loss_kwh,
        susut_tanpa_emin_persen=loss_pct,
    )


def calculate_cumulative_loss_without_emin(periods: Iterable[LossCalculationInput]):
    total = LossCalculationInput.create(kwh_utama=0)
    for period in periods:
        total = LossCalculationInput(
            kwh_utama=total.kwh_utama + period.kwh_utama,
            kwh_terima=total.kwh_terima + period.kwh_terima,
            kwh_kirim=total.kwh_kirim + period.kwh_kirim,
            pssd=total.pssd + period.pssd,
            kwh_jual=total.kwh_jual + period.kwh_jual,
            emin=total.emin + period.emin,
        )
    return calculate_monthly_loss_without_emin(total)
