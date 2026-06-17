from pathlib import Path


path = Path("backend/app.py")
source = path.read_text(encoding="utf-8")

start_marker = "@app.route('/api/meter-data')\n"
end_marker = "@app.route('/api/transfer-data')\n"
if start_marker not in source:
    raise RuntimeError("Legacy meter-data route was not found")
if end_marker not in source:
    raise RuntimeError("Transfer-data route was not found")

start = source.index(start_marker)
end = source.index(end_marker, start)
source = source[:start] + source[end:]

if start_marker in source:
    raise RuntimeError("Legacy meter-data route remains")

path.write_text(source, encoding="utf-8")
