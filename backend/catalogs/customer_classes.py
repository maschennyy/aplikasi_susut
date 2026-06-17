"""Katalog golongan pelanggan untuk modul kWh jual.

Data ini bersifat statis dan dipisahkan dari ``app.py`` agar dapat digunakan
oleh service, route, validasi, dan frontend tanpa menduplikasi definisi.
"""

KWH_JUAL_GROUP_LABELS = {
    "S": "Sosial",
    "R": "Rumah Tangga",
    "B": "Bisnis",
    "I": "Industri",
    "P": "Pemerintah",
    "TCL": "T/C/L Khusus",
}

KWH_JUAL_CATALOG = (
    {"group": "S", "golongan": "S", "sub_golongan": "S.1 / 450 VA", "tegangan": "TR"},
    {"group": "S", "golongan": "S", "sub_golongan": "S.1 / 900 VA", "tegangan": "TR"},
    {"group": "S", "golongan": "S", "sub_golongan": "S.1 / 1.300 VA", "tegangan": "TR"},
    {"group": "S", "golongan": "S", "sub_golongan": "S.1 / 2.200 VA", "tegangan": "TR"},
    {"group": "S", "golongan": "S", "sub_golongan": "S.1 / 3.500 VA s.d 200 kVA", "tegangan": "TR"},
    {"group": "S", "golongan": "S", "sub_golongan": "S.2 / > 200 kVA s.d < 30.000 kVA", "tegangan": "TM"},
    {"group": "R", "golongan": "R", "sub_golongan": "R.1 / 450 VA", "tegangan": "TR"},
    {"group": "R", "golongan": "R", "sub_golongan": "R.1 / 900 VA", "tegangan": "TR"},
    {"group": "R", "golongan": "R", "sub_golongan": "R.1M / 900 VA", "tegangan": "TR"},
    {"group": "R", "golongan": "R", "sub_golongan": "R.1 / 1.300 VA", "tegangan": "TR"},
    {"group": "R", "golongan": "R", "sub_golongan": "R.1 / 2.200 VA", "tegangan": "TR"},
    {"group": "R", "golongan": "R", "sub_golongan": "R.2 / 3.500 VA s.d 5.500 VA", "tegangan": "TR"},
    {"group": "R", "golongan": "R", "sub_golongan": "R.3 / 6.600 VA s.d 200 kVA", "tegangan": "TR"},
    {"group": "R", "golongan": "R", "sub_golongan": "R.3 / > 200 kVA s.d < 30.000 kVA", "tegangan": "TM"},
    {"group": "B", "golongan": "B", "sub_golongan": "B.1 / 450 VA", "tegangan": "TR"},
    {"group": "B", "golongan": "B", "sub_golongan": "B.1 / 900 VA", "tegangan": "TR"},
    {"group": "B", "golongan": "B", "sub_golongan": "B.1 / 1.300 VA", "tegangan": "TR"},
    {"group": "B", "golongan": "B", "sub_golongan": "B.1 / 2.200 VA s.d 5.500 VA", "tegangan": "TR"},
    {"group": "B", "golongan": "B", "sub_golongan": "B.2 / 6.600 VA s.d 200 kVA", "tegangan": "TR"},
    {"group": "B", "golongan": "B", "sub_golongan": "B.3 / > 200 kVA s.d < 30.000 kVA", "tegangan": "TM"},
    {"group": "B", "golongan": "B", "sub_golongan": "B.3 / 30.000 kVA keatas", "tegangan": "TT"},
    {"group": "I", "golongan": "I", "sub_golongan": "I.1 / 450 VA", "tegangan": "TR"},
    {"group": "I", "golongan": "I", "sub_golongan": "I.1 / 900 VA", "tegangan": "TR"},
    {"group": "I", "golongan": "I", "sub_golongan": "I.1 / 1.300 VA", "tegangan": "TR"},
    {"group": "I", "golongan": "I", "sub_golongan": "I.1 / 2.200 VA", "tegangan": "TR"},
    {"group": "I", "golongan": "I", "sub_golongan": "I.1 / 3.500 s.d 14 kVA", "tegangan": "TR"},
    {"group": "I", "golongan": "I", "sub_golongan": "I.2 / > 14 kVA s.d 200 kVA", "tegangan": "TR"},
    {"group": "I", "golongan": "I", "sub_golongan": "I.3 / > 200 kVA", "tegangan": "TM"},
    {"group": "I", "golongan": "I", "sub_golongan": "I.4 / 30.000 kVA keatas", "tegangan": "TT"},
    {"group": "P", "golongan": "P", "sub_golongan": "P.1 / 450 VA", "tegangan": "TR"},
    {"group": "P", "golongan": "P", "sub_golongan": "P.1 / 900 VA", "tegangan": "TR"},
    {"group": "P", "golongan": "P", "sub_golongan": "P.1 / 1.300 VA", "tegangan": "TR"},
    {"group": "P", "golongan": "P", "sub_golongan": "P.1 / 2.200 VA s.d 5.500 VA", "tegangan": "TR"},
    {"group": "P", "golongan": "P", "sub_golongan": "P.1 / 6.600 VA s.d 200 kVA", "tegangan": "TR"},
    {"group": "P", "golongan": "P", "sub_golongan": "P.2 / > 200 kVA", "tegangan": "TM"},
    {"group": "P", "golongan": "P", "sub_golongan": "P.3 (khusus)", "tegangan": "TT"},
    {"group": "TCL", "golongan": "T", "sub_golongan": "T / TM > 200 kVA s.d < 30.000 kVA", "tegangan": "TM"},
    {"group": "TCL", "golongan": "T", "sub_golongan": "T / TT 30.000 kVA keatas", "tegangan": "TT"},
    {"group": "TCL", "golongan": "C", "sub_golongan": "C / TR s.d 200 kVA", "tegangan": "TR"},
    {"group": "TCL", "golongan": "C", "sub_golongan": "C / TM > 200 kVA s.d < 30.000 kVA", "tegangan": "TM"},
    {"group": "TCL", "golongan": "C", "sub_golongan": "C / TT 30.000 kVA keatas", "tegangan": "TT"},
    {"group": "TCL", "golongan": "L", "sub_golongan": "L / TR s.d 200 kVA", "tegangan": "TR"},
    {"group": "TCL", "golongan": "L", "sub_golongan": "L / TM > 200 kVA s.d < 30.000 kVA", "tegangan": "TM"},
    {"group": "TCL", "golongan": "L", "sub_golongan": "L / TT 30.000 kVA keatas", "tegangan": "TT"},
)

KWH_JUAL_SUB_INDEX = {
    item["sub_golongan"]: item
    for item in KWH_JUAL_CATALOG
}


def _validate_catalog() -> None:
    """Fail fast when the static catalog contains invalid or duplicate rows."""
    seen = set()
    valid_voltages = {"TR", "TM", "TT"}

    for item in KWH_JUAL_CATALOG:
        group = item["group"]
        sub_group = item["sub_golongan"]
        voltage = item["tegangan"]

        if group not in KWH_JUAL_GROUP_LABELS:
            raise RuntimeError(f"Grup katalog tidak dikenali: {group}")
        if voltage not in valid_voltages:
            raise RuntimeError(f"Tegangan katalog tidak dikenali: {voltage}")
        if sub_group in seen:
            raise RuntimeError(f"Sub-golongan duplikat: {sub_group}")
        seen.add(sub_group)


def catalog_payload() -> dict:
    """Return a JSON-safe copy of the customer-class catalog."""
    return {
        "groups": dict(KWH_JUAL_GROUP_LABELS),
        "rows": [dict(item) for item in KWH_JUAL_CATALOG],
    }


def find_customer_class(sub_golongan: str | None) -> dict | None:
    """Find one catalog row without exposing the mutable source dictionary."""
    key = str(sub_golongan or "").strip()
    item = KWH_JUAL_SUB_INDEX.get(key)
    return dict(item) if item else None


_validate_catalog()
