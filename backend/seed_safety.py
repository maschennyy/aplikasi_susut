"""Safety checks for destructive development seed operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


CONFIRMATION_PHRASE = "RESET DATABASE LOKAL"
AUTOMATION_CONFIRMATION_TOKEN = "RESET_LOCAL_DEVELOPMENT_DATABASE"
LOCAL_DATABASE_HOSTS = {"localhost", "127.0.0.1", "::1"}


class SeedSafetyError(RuntimeError):
    """Raised when a destructive seed operation is not safe to execute."""


@dataclass(frozen=True)
class SeedTarget:
    backend: str
    database: str
    host: str | None
    display_url: str


def _is_enabled(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def validate_seed_target(
    *,
    app_env: str | None,
    database_url: str | None,
    allow_destructive_seed: str | bool | None,
) -> SeedTarget:
    """Validate that seeding targets an explicitly allowed local development DB."""
    normalized_env = (app_env or "").strip().lower()
    if normalized_env != "development":
        raise SeedSafetyError(
            "Seed hanya boleh dijalankan saat APP_ENV=development. "
            f"Environment saat ini: {normalized_env or 'tidak diisi'}."
        )

    if not _is_enabled(allow_destructive_seed):
        raise SeedSafetyError(
            "Operasi seed destruktif belum diizinkan. "
            "Isi ALLOW_DESTRUCTIVE_SEED=true hanya pada backend/.env lokal."
        )

    if not database_url:
        raise SeedSafetyError("DATABASE_URL tidak tersedia.")

    try:
        url = make_url(database_url)
    except (ArgumentError, TypeError, ValueError) as exc:
        raise SeedSafetyError("DATABASE_URL tidak valid.") from exc

    backend = url.get_backend_name()
    database = url.database or ""
    host = url.host

    if backend == "sqlite":
        if database in {"", ":memory:"}:
            raise SeedSafetyError(
                "Seed tidak boleh dijalankan pada SQLite in-memory karena data akan hilang saat proses selesai."
            )
    else:
        if not host or host.lower() not in LOCAL_DATABASE_HOSTS:
            raise SeedSafetyError(
                "Seed hanya boleh menargetkan database lokal. "
                f"Host terdeteksi: {host or 'tidak tersedia'}."
            )
        if not database:
            raise SeedSafetyError("Nama database pada DATABASE_URL tidak tersedia.")

    return SeedTarget(
        backend=backend,
        database=database,
        host=host,
        display_url=url.render_as_string(hide_password=True),
    )


def require_seed_confirmation(
    *,
    target: SeedTarget,
    assume_yes: bool,
    automation_token: str | None,
    input_fn: Callable[[str], str] = input,
) -> None:
    """Require an interactive phrase or a dedicated non-interactive token."""
    if assume_yes:
        if automation_token != AUTOMATION_CONFIRMATION_TOKEN:
            raise SeedSafetyError(
                "Opsi --yes membutuhkan SEED_CONFIRMATION="
                f"{AUTOMATION_CONFIRMATION_TOKEN}."
            )
        return

    prompt = (
        "\nPERINGATAN: data master dan pembacaan pada database berikut akan dihapus.\n"
        f"Target: {target.display_url}\n"
        f"Ketik persis '{CONFIRMATION_PHRASE}' untuk melanjutkan: "
    )
    confirmation = input_fn(prompt).strip()
    if confirmation != CONFIRMATION_PHRASE:
        raise SeedSafetyError("Konfirmasi tidak cocok. Seed dibatalkan tanpa mengubah database.")
