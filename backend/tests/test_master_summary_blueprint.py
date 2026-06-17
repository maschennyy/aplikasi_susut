import unittest

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import (
    AreaUnit,
    FeederReading,
    GarduInduk,
    MeterReading,
    Penyulang,
    Trafo,
)
from backend.services.master_summary import get_master_data_summary


class MasterSummaryBlueprintTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            upgrade(directory=str(MIGRATIONS_DIR))
        cls.client = app.test_client()

    def setUp(self):
        with app.app_context():
            FeederReading.query.delete()
            MeterReading.query.delete()
            Penyulang.query.delete()
            Trafo.query.delete()
            GarduInduk.query.delete()
            AreaUnit.query.delete()
            db.session.commit()

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def test_summary_route_is_registered_from_master_blueprint(self):
        rule = next(
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/master-data/summary"
        )
        self.assertEqual(rule.endpoint, "master.api_master_summary")

    def test_service_counts_active_records_and_mapping_gaps(self):
        with app.app_context():
            db.session.add_all([
                AreaUnit(kode_unit="UP3-A", nama_unit="UP3 Aktif", aktif=True),
                AreaUnit(kode_unit="UP3-X", nama_unit="UP3 Nonaktif", aktif=False),
            ])

            gi_active = GarduInduk(kode_gi="GIA", nama_gi="GI Aktif", aktif=True)
            gi_inactive = GarduInduk(kode_gi="GIX", nama_gi="GI Nonaktif", aktif=False)
            db.session.add_all([gi_active, gi_inactive])
            db.session.flush()

            trafo_with_feeder = Trafo(
                gi_id=gi_active.id,
                kode_trafo="T1",
                nama_trafo="Trafo Dengan Feeder",
                kapasitas_mva=60,
                aktif=True,
            )
            trafo_without_feeder = Trafo(
                gi_id=gi_active.id,
                kode_trafo="T2",
                nama_trafo="Trafo Tanpa Feeder",
                kapasitas_mva=60,
                aktif=True,
            )
            inactive_trafo = Trafo(
                gi_id=gi_inactive.id,
                kode_trafo="TX",
                nama_trafo="Trafo Nonaktif",
                kapasitas_mva=30,
                aktif=False,
            )
            db.session.add_all([
                trafo_with_feeder,
                trafo_without_feeder,
                inactive_trafo,
            ])
            db.session.flush()

            db.session.add_all([
                Penyulang(
                    gi_id=gi_active.id,
                    trafo_id=trafo_with_feeder.id,
                    kode_penyulang="F-MAP",
                    nama_penyulang="Feeder Terpetakan",
                    area_up3="UP3 Aktif",
                    aktif=True,
                ),
                Penyulang(
                    gi_id=gi_active.id,
                    trafo_id=trafo_with_feeder.id,
                    kode_penyulang="F-MISS",
                    nama_penyulang="Feeder Tanpa Area",
                    area_up3=None,
                    aktif=True,
                ),
                Penyulang(
                    gi_id=gi_inactive.id,
                    trafo_id=inactive_trafo.id,
                    kode_penyulang="F-OFF",
                    nama_penyulang="Feeder Nonaktif",
                    area_up3="",
                    aktif=False,
                ),
            ])
            db.session.commit()

            result = get_master_data_summary()

        self.assertEqual(result, {
            "gi": 1,
            "trafo": 2,
            "penyulang": 2,
            "area_unit": 1,
            "missing_area": 1,
            "trafo_without_feeder": 1,
        })

    def test_endpoint_preserves_existing_response_shape(self):
        response = self.client.get("/api/master-data/summary")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload, {
            "gi": 0,
            "trafo": 0,
            "penyulang": 0,
            "area_unit": 0,
            "missing_area": 0,
            "trafo_without_feeder": 0,
        })


if __name__ == "__main__":
    unittest.main()
