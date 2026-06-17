from pathlib import Path


app_path = Path("backend/app.py")
source = app_path.read_text(encoding="utf-8")
start_marker = "@app.route('/api/area-unit', methods=['GET', 'POST'])\n"
end_marker = "@app.route('/api/penyulang-area')\n"

if start_marker not in source or end_marker not in source:
    raise RuntimeError("Master route cleanup markers were not found")

start = source.index(start_marker)
end = source.index(end_marker, start)
source = source[:start] + source[end:]
app_path.write_text(source, encoding="utf-8")

entrypoint_path = Path("backend/entrypoint.py")
entrypoint = entrypoint_path.read_text(encoding="utf-8")
entrypoint = entrypoint.replace(
    "from .route_compat import normalize_migrated_routes\n",
    "",
)
block_start = entrypoint.index("normalize_migrated_routes(\n")
registration = "register_migration_commands(app, db)\n"
block_end = entrypoint.index(registration, block_start)
entrypoint = entrypoint[:block_start] + entrypoint[block_end:]
entrypoint_path.write_text(entrypoint, encoding="utf-8")
