import unittest
from datetime import date

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import FeederReading, GarduInduk, MeterReading, Penyulang, Trafo
from backend.services.feeder_data import FeederDataServiceError
from backend.services.meter_data import MeterDataServiceError, list_meter_data
from backend.services.reading_filters import ReadingFilterError


class MeterDataServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))

    def setUp(self):
        with app.app_context():
            FeederReading.query.delete()
            MeterReading.query.delete()
            Penyulang.query.delete()
            Trafo.query.delete()
            GarduInduk.query.delete()
            db.session.commit()

            gi_a = GarduInduk(kode_gi="MDA", nama_gi="GI Meter A", aktif=True)
            gi_b = GarduInduk(kode_gi="MDB", nama_gi="GI Meter B", aktif=True)
            db.session.add_all([gi_a, gi_b])
            db.session.flush()

            trafo_a = Trafo(
                gi_id=gi_a.id,
                kode_trafo="T-A",
                nama_trafo="Trafo Meter A",
                kapasitas_mva=60,
                aktif=True,
            )
            trafo_b = Trafo(
                gi_id=gi_b.id,
                kode_trafo="T-B",
                nama_trafo="Trafo Meter B",
                kapasitas_mva=60,
                aktif=True,
            )
            db.session.add_all([trafo_a, trafo_b])
            db.session.flush()

            db.session.add_all([
                MeterReading(
                    gi_id=gi_a.id,
                    trafo_id=trafo_a.id,
                    periode_bulan=date(2025, 5, 1),
                    mu_kwh_wbp=100,
                    mu_kwh_lwbp1=20,
                    mu_kwh_lwbp2=5,
                    mp_kwh_wbp=90,
                    mp_kwh_lwbp1=10,
                    mp_kwh_lwbp2=0,
                ),
                MeterReading(
                    gi_id=gi_b.id,
                    trafo_id=trafo_b.id,
                    periode_bulan=date(2025, 6, 1),
                    mu_kwh_wbp=200,
                    mp_kwh_wbp=190,
                ),
            ])
            db.session.commit()
            self.gi_a = gi_a.id
            self.gi_b = gi_b.id
            self.trafo_a = trafo_a.id
            self.trafo_b = trafo_b.id

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def test_enriches_meter_reading_with_trafo_and_gi(self):
        with app.app_context():
            result = list_meter_data(month="2025-05")

        rows = result["rows"]
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["page"], 1)
        self.assertEqual(result["page_size"], 100)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["kode_trafo"], "T-A")
        self.assertEqual(row["nama_trafo"], "Trafo Meter A")
        self.assertEqual(row["nama_gi"], "GI Meter A")
        self.assertEqual(row["mu_kwh_total"], 125.0)
        self.assertEqual(row["mp_kwh_total"], 100.0)
        self.assertEqual(row["deviasi_mu_mp"], 20.0)

    def test_filters_by_gi_trafo_and_month(self):
        with app.app_context():
            result = list_meter_data(
                gi_id=self.gi_b,
                trafo_id=self.trafo_b,
                month="2025-06",
            )
        rows = result["rows"]
        self.assertEqual([row["kode_trafo"] for row in rows], ["T-B"])
        self.assertEqual(rows[0]["nama_gi"], "GI Meter B")

    def test_paginates_and_caps_page_size(self):
        with app.app_context():
            first_page = list_meter_data(page=1, page_size=1)
            second_page = list_meter_data(page=2, page_size=1)
            capped = list_meter_data(page_size=999)

        self.assertEqual(first_page["total"], 2)
        self.assertEqual(first_page["page_size"], 1)
        self.assertEqual(first_page["pages"], 2)
        self.assertTrue(first_page["has_next"])
        self.assertEqual(len(first_page["rows"]), 1)
        self.assertEqual(len(second_page["rows"]), 1)
        self.assertEqual(capped["page_size"], 500)

    def test_feeder_and_meter_reuse_same_filter_error(self):
        self.assertIs(FeederDataServiceError, ReadingFilterError)
        self.assertIs(MeterDataServiceError, ReadingFilterError)


if __name__ == "__main__":
    unittest.main()
