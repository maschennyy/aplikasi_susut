import unittest
from decimal import Decimal

from backend.services.loss_calculation import (
    LossCalculationInput,
    calculate_cumulative_loss_without_emin,
    calculate_monthly_loss_without_emin,
)


class LossCalculationTest(unittest.TestCase):
    def test_january_example_matches_report(self):
        data = LossCalculationInput.create(
            kwh_utama=343_880_003,
            kwh_terima=39_624_065,
            kwh_kirim=55_319_301,
            pssd=2_438_439,
            kwh_jual=292_999_963,
            emin=4_971_114,
        )
        result = calculate_monthly_loss_without_emin(data)
        self.assertEqual(result.kwh_produksi, Decimal("383504068"))
        self.assertEqual(result.kwh_terima_netto, Decimal("328184767"))
        self.assertEqual(result.kwh_siap_jual, Decimal("325746328"))
        self.assertEqual(result.susut_tanpa_emin_kwh, Decimal("37717479"))
        self.assertEqual(
            result.susut_tanpa_emin_persen.quantize(Decimal("0.01")),
            Decimal("9.83"),
        )

    def test_emin_is_added_back_for_without_emin_loss(self):
        data = LossCalculationInput.create(kwh_utama=1000, kwh_jual=800, emin=50)
        result = calculate_monthly_loss_without_emin(data)
        self.assertEqual(result.susut_tanpa_emin_kwh, Decimal("250"))

    def test_cumulative_uses_accumulated_kwh_not_average_percentage(self):
        january = LossCalculationInput.create(kwh_utama=1000, kwh_jual=800, emin=50)
        february = LossCalculationInput.create(kwh_utama=2000, kwh_jual=1900, emin=20)
        result = calculate_cumulative_loss_without_emin([january, february])
        self.assertEqual(result.kwh_produksi, Decimal("3000"))
        self.assertEqual(result.kwh_jual, Decimal("2700"))
        self.assertEqual(result.emin, Decimal("70"))
        self.assertEqual(result.susut_tanpa_emin_kwh, Decimal("370"))
        self.assertEqual(
            result.susut_tanpa_emin_persen.quantize(Decimal("0.01")),
            Decimal("12.33"),
        )

    def test_rejects_sent_energy_above_production(self):
        data = LossCalculationInput.create(kwh_utama=100, kwh_kirim=101)
        with self.assertRaisesRegex(ValueError, "kwh_kirim"):
            calculate_monthly_loss_without_emin(data)

    def test_rejects_negative_input(self):
        with self.assertRaisesRegex(ValueError, "kwh_jual"):
            LossCalculationInput.create(kwh_utama=100, kwh_jual=-1)

    def test_zero_production_returns_zero_percentage(self):
        data = LossCalculationInput.create(kwh_utama=0)
        result = calculate_monthly_loss_without_emin(data)
        self.assertEqual(result.susut_tanpa_emin_persen, Decimal("0"))


if __name__ == "__main__":
    unittest.main()
