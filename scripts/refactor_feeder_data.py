from pathlib import Path


path = Path("backend/app.py")
source = path.read_text(encoding="utf-8")

readings_import = "from .routes.readings import readings_bp\n"
if readings_import not in source:
    anchor = "from .routes.master import master_bp\n"
    if anchor not in source:
        raise RuntimeError("Master blueprint import anchor was not found")
    source = source.replace(anchor, readings_import + anchor, 1)

registration = "app.register_blueprint(readings_bp)\n"
if registration not in source:
    anchor = "app.register_blueprint(dashboard_bp)\n"
    if anchor not in source:
        raise RuntimeError("Dashboard blueprint registration was not found")
    source = source.replace(anchor, anchor + registration, 1)

start_marker = "@app.route('/api/feeder-data')\n"
end_marker = "@app.route('/api/meter-data')\n"
if start_marker not in source:
    raise RuntimeError("Legacy feeder-data route was not found")
if end_marker not in source:
    raise RuntimeError("Meter-data route was not found")

start = source.index(start_marker)
end = source.index(end_marker, start)
source = source[:start] + source[end:]

if start_marker in source:
    raise RuntimeError("Legacy feeder-data route remains")
if source.count(registration) != 1:
    raise RuntimeError("Readings blueprint must be registered exactly once")

path.write_text(source, encoding="utf-8")
