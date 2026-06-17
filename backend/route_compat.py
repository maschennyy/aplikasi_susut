"""Compatibility helpers while routes are migrated out of the monolith."""

from __future__ import annotations

from flask import Flask


def deactivate_legacy_endpoints(app: Flask, *endpoint_names: str) -> None:
    """Remove legacy endpoint rules after their blueprint replacements exist."""
    for endpoint_name in endpoint_names:
        app.view_functions.pop(endpoint_name, None)
        app.url_map._rules_by_endpoint.pop(endpoint_name, None)

    app.url_map._remap = True
    app.url_map.update()
