import unittest

from flask_migrate import upgrade

from backend.entrypoint import MIGRATIONS_DIR, app, db
from backend.models import (
    FeederReading,
    GarduInduk,
    MeterReading,
    Penyulang,
    Trafo,
)


class PenyulangAreaBlueprintTest(unittest.TestCase):
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
            db.session.commit()

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def _create_trafo(self) -> tuple[int, int]:
        with app.app_context():
            gi = GarduInduk(
                kode_gi="AREA",
                nama_gi="GI Area",
                aktif=True,
            )
            db.session.add(gi)
            db.session.flush()

            trafo = Trafo(
                gi_id=gi.id,
                kode_trafo="T-AREA",
                nama_trafo="Trafo Area",
                kapasitas_mva=60,
                aktif=True,
            )
            db.session.add(trafo)
            db.session.commit()
            return gi.id, trafo.id

    def test_route_is_registered_once_from_master_blueprint(self):
        rules = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/penyulang-area"
        ]
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0].endpoint, "master.api_penyulang_area")

    def test_endpoint_returns_sorted_distinct_active_nonempty_areas(self):
        gi_id, trafo_id = self._create_trafo()
        with app.app_context():
            rows = [
                ("F1", "UP3 B", True),
                ("F2", "UP3 A", True),
                ("F3", "UP3 A", True),
                ("F4", None, True),
                ("F5", "", True),
                ("F6", "UP3 X", False),
            ]
            for kode, area, aktif in rows:
                db.session.add(Penyulang(
                    gi_id=gi_id,
                    trafo_id=trafo_id,
                    kode_penyulang=kode,
                    nama_penyulang=f"Penyulang {kode}",
                    area_up3=area,
                    status="AKTIF" if aktif else "NONAKTIF",
                    aktif=aktif,
                ))
            db.session.commit()

        response = self.client.get("/api/penyulang-area")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), ["UP3 A", "UP3 B"])


if __name__ == "__main__":
    unittest.main()
