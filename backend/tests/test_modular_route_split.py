import unittest
from pathlib import Path

from backend.entrypoint import app


BACKEND_DIR = Path(__file__).resolve().parents[1]


class ModularRouteSplitTest(unittest.TestCase):
    def test_moved_routes_are_not_registered_in_app_monolith(self):
        source = (BACKEND_DIR / "app.py").read_text(encoding="utf-8")
        moved_route_markers = [
            "@app.route('/login'",
            "@app.route('/logout'",
            "@app.route('/api/csrf-token'",
            "@app.route('/api/monthly-status'",
            "@app.route('/api/export/",
            "@app.route('/api/audit-log'",
            "@app.route('/api/security-summary'",
            "@app.route('/api/module-access'",
            "@app.route('/api/users'",
            "@app.route('/api/me'",
            "@app.route('/api/upload'",
            "@app.route('/api/nkwh/",
            "@app.route('/api/upload-penyulang'",
        ]
        for marker in moved_route_markers:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, source)

    def test_moved_routes_are_registered_once_from_blueprints(self):
        expected = {
            "/login": "auth.login",
            "/logout": "auth.logout",
            "/api/csrf-token": "auth.api_csrf_token",
            "/api/monthly-status": "workflow.api_monthly_status_list",
            "/api/monthly-status/<periode>": "workflow.api_monthly_status_detail",
            "/api/monthly-status/<periode>/activity": "workflow.api_monthly_status_activity",
            "/api/monthly-status/<periode>/readiness": "workflow.api_monthly_status_readiness",
            "/api/monthly-status/<periode>/audit-package": "workflow.api_monthly_status_audit_package",
            "/api/export/<module>.<fmt>": "export.api_export_report",
            "/api/audit-log": "security.api_audit_log",
            "/api/security-summary": "security.api_security_summary",
            "/api/module-access": "security.api_module_access",
            "/api/users": {"security.api_users_list", "security.api_users_create"},
            "/api/users/<int:user_id>": "security.api_users_update",
            "/api/users/<int:user_id>/password": "security.api_users_reset_password",
            "/api/me": "profile.api_me_profile",
            "/api/me/password": "profile.api_change_own_password",
            "/api/upload": "upload.api_upload",
            "/api/nkwh/analyze": "upload.api_nkwh_analyze",
            "/api/nkwh/import": "upload.api_nkwh_import",
            "/api/upload-penyulang": "upload.api_upload_penyulang",
        }
        for path, endpoint in expected.items():
            rules = [rule for rule in app.url_map.iter_rules() if rule.rule == path]
            with self.subTest(path=path):
                expected_count = len(endpoint) if isinstance(endpoint, set) else 1
                self.assertEqual(len(rules), expected_count)
                endpoints = {rule.endpoint for rule in rules}
                if isinstance(endpoint, set):
                    self.assertEqual(endpoints, endpoint)
                else:
                    self.assertEqual(endpoints, {endpoint})


if __name__ == "__main__":
    unittest.main()
