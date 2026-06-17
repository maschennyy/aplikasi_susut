from pathlib import Path


path = Path("backend/app.py")
source = path.read_text(encoding="utf-8")

source = source.replace(
    "from .routes.dashboard import dashboard_bp\n",
    "from .routes.dashboard import (\n"
    "    dashboard_bp,\n"
    "    configure_executive_dashboard,\n"
    ")\n",
    1,
)

configuration_anchor = (
    "def _decimal_payload(value, default='0'):\n"
    "    if value in (None, ''):\n"
    "        return Decimal(default)\n"
    "    return Decimal(str(value))\n"
)
configuration = (
    configuration_anchor
    + "\n\nconfigure_executive_dashboard(\n"
    + "    readiness_provider=_readiness_payload,\n"
    + "    workflow_provider=_workflow_payload,\n"
    + ")\n"
)
if "configure_executive_dashboard(" not in source:
    if configuration_anchor not in source:
        raise RuntimeError("Executive dashboard configuration anchor was not found")
    source = source.replace(configuration_anchor, configuration, 1)

start_marker = "@app.route('/api/executive-dashboard')\n"
end_marker = "@app.route('/api/feeder-data')\n"
if start_marker not in source:
    raise RuntimeError("Legacy executive dashboard route was not found")
if end_marker not in source:
    raise RuntimeError("Feeder data route was not found")

start = source.index(start_marker)
end = source.index(end_marker, start)
source = source[:start] + source[end:]

if start_marker in source:
    raise RuntimeError("Legacy executive dashboard route remains")
if source.count("configure_executive_dashboard(") != 1:
    raise RuntimeError("Executive dashboard must be configured exactly once")

path.write_text(source, encoding="utf-8")
