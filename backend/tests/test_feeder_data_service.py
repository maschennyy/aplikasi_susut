import unittest
from datetime import date

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import FeederReading, GarduInduk, MeterReading, Penyulang, Trafo
from backend.services.feeder_data import FeederDataServiceError, list_feeder_data


class FeederDataServiceTest(unittest.TestCase):
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

            gi_a = GarduInduk(kode_gi="FDA", nama_gi="GI A", aktif=True)
            gi_b = GarduInduk(kode_gi="FDB", nama_gi="GI B", aktif=True)
            db.session.add_all([gi_a, gi_b])
            db.session.flush()

            trafo_a = Trafo(
                gi_id=gi_a.id,
                kode_trafo="TA",
                nama_trafo="Trafo A",
                kapasitas_mva=60,
                aktif=True,
            )
            trafo_b = Trafo(
                gi_id=gi_b.id,
                kode_trafo="TB",
                nama_trafo="Trafo B",
                kapasitas_mva=60,
                aktif=True,
            )
            db.session.add_all([trafo_a, trafo_b])
            db.session.flush()

            feeder_a = Penyulang(
                gi_id=gi_a.id,
                trafo_id=trafo_a.id,
                kode_penyulang="A-02",
                nama_penyulang="Feeder A",
                jenis="REGULAR",
                area_up3="UP3 A",
                ex_cabang="EX-A",
                aktif=False,
            )
            feeder_b = Penyulang(
                gi_id=gi_b.id,
                trafo_id=trafo_b.id,
                kode_penyulang="B-01",
                nama_penyulang="Feeder B",
                jenis="EXIM",
                area_up3="UP3 B",
                status="CADANGAN",
                aktif=True,
            )
            db.session.add_all([feeder_a, feeder_b])
            db.session.flush()
            feeder_a.status = None
            feeder_a.aktif = False

            db.session.add_all([
                FeederReading(
                    gi_id=gi_a.id,
                    trafo_id=trafo_a.id,
                    penyulang_id=feeder_a.id,
                    periode_bulan=date(2025, 5, 1),
                    kwh_wbp=100,
                    kwh_lwbp1=20,
                    kwh_lwbp2=5,
                ),
                FeederReading(
                    gi_id=gi_b.id,
                    trafo_id=trafo_b.id,
                    penyulang_id=feeder_b.id,
                    periode_bulan=date(2025, 6, 1),
                    kwh_wbp=200,
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

    def test_enriches_reading_with_penyulang_master_fields(self):
        with app.app_context():
            rows = list_feeder_data(month="2025-05")

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["kode_penyulang"], "A-02")
        self.assertEqual(row["nama_penyulang"], "Feeder A")
        self.assertEqual(row["jenis"], "REGULAR")
        self.assertEqual(row["area_up3"], "UP3 A")
        self.assertEqual(row["ex_cabang"], "EX-A")
        self.assertEqual(row["status"], "NONAKTIF")
        self.assertEqual(row["kwh_total"], 125.0)

    def test_filters_by_gi_trafo_and_month(self):
        with app.app_context():
            rows = list_feeder_data(
                gi_id=self.gi_b,
                trafo_id=self.trafo_b,
                month="2025-06",
            )
        self.assertEqual([row["kode_penyulang"] for row in rows], ["B-01"])
        self.assertEqual(rows[0]["status"], "CADANGAN")

    def test_rejects_trafo_from_different_gi(self):
        with app.app_context():
            with self.assertRaises(FeederDataServiceError) as context:
                list_feeder_data(gi_id=self.gi_a, trafo_id=self.trafo_b)
        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(
            str(context.exception),
            "Trafo tidak berada pada Gardu Induk yang dipilih.",
        )


if __name__ == "__main__":
    unittest.main()
