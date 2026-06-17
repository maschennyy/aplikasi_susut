import unittest

from backend.entrypoint import app


class AreaUnitRouteMapTest(unittest.TestCase):
    def test_only_blueprint_routes_are_active(self):
        rules = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule.startswith("/api/area-unit")
        ]
        self.assertEqual(len(rules), 2)
        endpoints = {rule.endpoint for rule in rules}
        self.assertEqual(
            endpoints,
            {"master.api_area_unit", "master.api_area_unit_update"},
        )
        self.assertNotIn("api_area_unit", app.view_functions)
        self.assertNotIn("api_area_unit_update", app.view_functions)


if __name__ == "__main__":
    unittest.main()
