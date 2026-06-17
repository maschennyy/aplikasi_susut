from pathlib import Path


APP_PATH = Path("backend/app.py")


def main() -> None:
    source = APP_PATH.read_text(encoding="utf-8")

    import_anchor = (
        "from nkwh_excel import analyze_workbook, parse_nkwh_feeders, parse_exim_rows\n"
    )
    blueprint_import = "from .routes.system import system_bp\n"
    if blueprint_import not in source:
        if import_anchor not in source:
            raise RuntimeError("Import anchor tidak ditemukan pada backend/app.py")
        source = source.replace(
            import_anchor,
            import_anchor + blueprint_import,
            1,
        )

    migrate_block = """migrate = Migrate(
    app,
    db,
    directory=str(MIGRATIONS_DIR),
    compare_type=True,
    render_as_batch=True,
)
"""
    registration = "\napp.register_blueprint(system_bp)\n"
    if "app.register_blueprint(system_bp)" not in source:
        if migrate_block not in source:
            raise RuntimeError("Blok Flask-Migrate tidak ditemukan pada backend/app.py")
        source = source.replace(
            migrate_block,
            migrate_block + registration,
            1,
        )

    sidebar_marker = """# ════════════════════════════════════════════════
# API — SIDEBAR STATS
# ════════════════════════════════════════════════
"""
    master_marker = """# ════════════════════════════════════════════════
# API — MASTER DATA
# ════════════════════════════════════════════════
"""
    if sidebar_marker in source:
        start = source.index(sidebar_marker)
        end = source.index(master_marker, start)
        source = source[:start] + master_marker + source[end + len(master_marker):]

    if "@app.route('/api/sidebar-stats')" in source:
        raise RuntimeError("Route sidebar lama masih tersisa pada backend/app.py")
    if source.count("app.register_blueprint(system_bp)") != 1:
        raise RuntimeError("Registrasi system blueprint harus tepat satu kali")

    APP_PATH.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
