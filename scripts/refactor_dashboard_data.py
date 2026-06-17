from pathlib import Path

path = Path("backend/app.py")
source = path.read_text(encoding="utf-8")

source = source.replace(
    "from .routes.system import system_bp\n",
    "from .routes.system import system_bp\nfrom .routes.dashboard import dashboard_bp\n",
    1,
)
source = source.replace(
    "app.register_blueprint(system_bp)\n",
    "app.register_blueprint(system_bp)\napp.register_blueprint(dashboard_bp)\n",
    1,
)

start_marker = "@app.route('/api/dashboard-data')\n"
end_marker = (
    "# ════════════════════════════════════════════════\n"
    "# API — FEEDER, METER, TRANSFER, REKAP\n"
)
start = source.index(start_marker)
end = source.index(end_marker, start)
source = source[:start] + source[end:]

if start_marker in source:
    raise RuntimeError("dashboard-data route source still exists")
if source.count("app.register_blueprint(dashboard_bp)") != 1:
    raise RuntimeError("dashboard blueprint registration is invalid")

path.write_text(source, encoding="utf-8")
