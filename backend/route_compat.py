"""Compatibility helpers for routes migrated from the monolith."""

from __future__ import annotations

from flask import Flask


def normalize_migrated_routes(app: Flask, *old_endpoint_names: str) -> None:
    """Keep only blueprint replacements in the active URL map."""
    for endpoint_name in old_endpoint_names:
        app.view_functions.pop(endpoint_name, None)
        app.url_map._rules_by_endpoint.pop(endpoint_name, None)

    app.url_map._remap = True
    app.url_map.update()
