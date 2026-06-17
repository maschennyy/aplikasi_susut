from pathlib import Path


path = Path("backend/app.py")
source = path.read_text(encoding="utf-8")

import_anchor = "from .routes.master import master_bp\n"
route_import = "from .routes.penyulang_area import register_penyulang_area_route\n"
if route_import not in source:
    if import_anchor not in source:
        raise RuntimeError("Master blueprint import was not found")
    source = source.replace(import_anchor, import_anchor + route_import, 1)

registration_anchor = (
    "app.register_blueprint(system_bp)\n"
    "app.register_blueprint(master_bp)\n"
)
registration = (
    "app.register_blueprint(system_bp)\n"
    "register_penyulang_area_route(master_bp)\n"
    "app.register_blueprint(master_bp)\n"
)
if "register_penyulang_area_route(master_bp)" not in source:
    if registration_anchor not in source:
        raise RuntimeError("Blueprint registration anchor was not found")
    source = source.replace(registration_anchor, registration, 1)

start_marker = "@app.route('/api/penyulang-area')\n"
end_marker = "# ════════════════════════════════════════════════\n# API — DASHBOARD\n"
if start_marker not in source:
    raise RuntimeError("Legacy penyulang-area route was not found")
if end_marker not in source:
    raise RuntimeError("Dashboard section marker was not found")

start = source.index(start_marker)
end = source.index(end_marker, start)
source = source[:start] + end_marker + source[end + len(end_marker):]

if start_marker in source:
    raise RuntimeError("Legacy penyulang-area route remains")
if source.count("register_penyulang_area_route(master_bp)") != 1:
    raise RuntimeError("Penyulang area registrar must be called exactly once")

path.write_text(source, encoding="utf-8")
