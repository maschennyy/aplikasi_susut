"""Small bridge for routes that are being lifted out of app.py.

This keeps the first split low-risk: route handlers move to blueprints while
legacy helpers and business logic still live in backend.app until the next
service extraction pass.
"""

from flask import abort, g

from ..core.security import json_error


def core():
    from .. import app as app_module

    return app_module


def require_roles(*roles):
    user = getattr(g, "current_user", None)
    if not user:
        return json_error("Login diperlukan.", 401)
    if user.role not in roles:
        abort(403)
    return None
