"""Compatibility bridge for routes still being lifted out of ``app.py``.

Workflow and readiness helpers are resolved from dedicated services first.
Other legacy attributes continue to fall back to the application module until
the remaining route extractions are complete.
"""

from flask import abort, g

from ..core.security import json_error
from ..services.monthly_readiness import readiness_payload
from ..services.monthly_workflow import (
    ensure_period_writable,
    mark_period_uploaded,
    monthly_activity_payload,
    normalize_workflow_status,
    workflow_allowed_statuses,
    workflow_payload,
    workflow_period,
    workflow_record,
)


_SERVICE_OVERRIDES = {
    "_ensure_period_writable": ensure_period_writable,
    "_mark_period_uploaded": mark_period_uploaded,
    "_monthly_activity_payload": monthly_activity_payload,
    "_normalize_workflow_status": normalize_workflow_status,
    "_readiness_payload": readiness_payload,
    "_workflow_allowed_statuses": workflow_allowed_statuses,
    "_workflow_payload": workflow_payload,
    "_workflow_period": workflow_period,
    "_workflow_record": workflow_record,
}


class _CoreProxy:
    def __init__(self, app_module):
        self._app_module = app_module

    def __getattr__(self, name):
        if name in _SERVICE_OVERRIDES:
            return _SERVICE_OVERRIDES[name]
        return getattr(self._app_module, name)


def core():
    from .. import app as app_module

    return _CoreProxy(app_module)


def require_roles(*roles):
    user = getattr(g, "current_user", None)
    if not user:
        return json_error("Login diperlukan.", 401)
    if user.role not in roles:
        abort(403)
    return None
