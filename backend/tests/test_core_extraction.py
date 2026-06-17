import unittest
from pathlib import Path

from backend.core.access import module_access_payload
from backend.core.constants import MODULE_ACCESS_MATRIX, ROLES


BACKEND_DIR = Path(__file__).resolve().parents[1]


class CoreExtractionTest(unittest.TestCase):
    def test_known_roles_and_module_matrix_are_exposed_from_core(self):
        self.assertEqual(ROLES, {"admin", "operator", "viewer", "auditor"})
        self.assertTrue(MODULE_ACCESS_MATRIX)
        self.assertTrue(all("module" in row and "access" in row for row in MODULE_ACCESS_MATRIX))

    def test_module_access_payload_resolves_admin_permissions(self):
        rows = module_access_payload("admin")

        self.assertEqual(len(rows), len(MODULE_ACCESS_MATRIX))
        self.assertTrue(all(row["role"] == "admin" for row in rows))
        security = next(row for row in rows if row["module"] == "Security")
        self.assertEqual(set(security["allowed_actions"]), {"read", "write", "audit"})

    def test_unknown_role_does_not_receive_resolved_actions(self):
        rows = module_access_payload("unknown")

        self.assertTrue(all("role" not in row for row in rows))
        self.assertTrue(all("allowed_actions" not in row for row in rows))

    def test_security_route_no_longer_uses_app_for_extracted_dependencies(self):
        source = (BACKEND_DIR / "routes" / "security.py").read_text(encoding="utf-8")

        forbidden_markers = [
            "from ._app_bridge import core",
            "core()._module_access_payload",
            "app_module.ROLES",
            "app_module.User",
            "app_module.AuditLog",
            "app_module._validate_password_policy",
            "app_module._request_payload",
        ]
        for marker in forbidden_markers:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, source)

    def test_auth_route_no_longer_uses_app_bridge(self):
        source = (BACKEND_DIR / "routes" / "auth.py").read_text(encoding="utf-8")

        forbidden_markers = [
            "from ._app_bridge import core",
            "app_module._validate_csrf",
            "app_module.LOGIN_FAILURES",
            "app_module._login_user",
            "app_module._logout_user",
            "core().csrf_token()",
        ]
        for marker in forbidden_markers:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, source)


if __name__ == "__main__":
    unittest.main()
