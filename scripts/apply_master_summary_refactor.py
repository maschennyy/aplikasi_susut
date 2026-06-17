from pathlib import Path


APP_PATH = Path("backend/app.py")


def main() -> None:
    source = APP_PATH.read_text(encoding="utf-8")

    import_anchor = "from .routes.system import system_bp\n"
    master_import = "from .routes.master import master_bp\n"
    if master_import not in source:
        if import_anchor not in source:
            raise RuntimeError("Import system blueprint tidak ditemukan")
        source = source.replace(import_anchor, import_anchor + master_import, 1)

    registration_anchor = "app.register_blueprint(system_bp)\n"
    master_registration = "app.register_blueprint(master_bp)\n"
    if master_registration not in source:
        if registration_anchor not in source:
            raise RuntimeError("Registrasi system blueprint tidak ditemukan")
        source = source.replace(
            registration_anchor,
            registration_anchor + master_registration,
            1,
        )

    summary_start = "@app.route('/api/master-data/summary')\n"
    area_start = "@app.route('/api/area-unit', methods=['GET', 'POST'])\n"
    if summary_start in source:
        start = source.index(summary_start)
        end = source.index(area_start, start)
        source = source[:start] + source[end:]

    if summary_start in source:
        raise RuntimeError("Route master summary lama masih tersisa")
    if source.count("app.register_blueprint(master_bp)") != 1:
        raise RuntimeError("Registrasi master blueprint harus tepat satu kali")
    if source.count(master_import) != 1:
        raise RuntimeError("Import master blueprint harus tepat satu kali")

    APP_PATH.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
