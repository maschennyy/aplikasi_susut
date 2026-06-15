import os
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent

# Prioritas konfigurasi:
# 1. Environment proses/hosting
# 2. backend/.env
# 3. root/.env sebagai fallback kompatibilitas
load_dotenv(BACKEND_DIR / '.env', override=False)
load_dotenv(ROOT_DIR / '.env', override=False)


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def _env_int(name, default):
    return int(os.getenv(name, str(default)))


_APP_ENV = os.getenv('APP_ENV', 'development').strip().lower()
_IS_TESTING = _APP_ENV == 'test'
_TEST_DATABASE_URL = os.getenv(
    'TEST_DATABASE_URL',
    'sqlite+pysqlite:///:memory:',
)


class Config:
    APP_ENV = _APP_ENV
    TESTING = _IS_TESTING

    # Test selalu memakai database terisolasi dan tidak membaca DATABASE_URL operasional.
    SQLALCHEMY_DATABASE_URI = (
        _TEST_DATABASE_URL if _IS_TESTING else os.getenv('DATABASE_URL')
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Secret test hanya berlaku ketika APP_ENV=test.
    SECRET_KEY = (
        os.getenv('TEST_SECRET_KEY', 'test-secret-key-not-for-production')
        if _IS_TESTING
        else os.getenv('SECRET_KEY', 'fallback-key-ganti-ini')
    )
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = (
        False if _IS_TESTING else _env_bool('SESSION_COOKIE_SECURE', False)
    )
    PERMANENT_SESSION_HOURS = _env_int('PERMANENT_SESSION_HOURS', 8)

    # Guardrail upload dan akses aplikasi.
    MAX_CONTENT_LENGTH = _env_int('MAX_UPLOAD_MB', 25) * 1024 * 1024
    MAX_IMPORT_ROWS = _env_int('MAX_IMPORT_ROWS', 20000)
    SECURITY_REQUIRE_LOGIN = (
        False if _IS_TESTING else _env_bool('SECURITY_REQUIRE_LOGIN', True)
    )
    PASSWORD_MIN_LENGTH = _env_int('PASSWORD_MIN_LENGTH', 10)
    LOGIN_RATE_LIMIT = _env_int('LOGIN_RATE_LIMIT', 5)
    LOGIN_RATE_WINDOW_MINUTES = _env_int('LOGIN_RATE_WINDOW_MINUTES', 15)
    LOGIN_LOCKOUT_MINUTES = _env_int('LOGIN_LOCKOUT_MINUTES', 15)
    UPLOAD_RATE_LIMIT = _env_int('UPLOAD_RATE_LIMIT', 10)
    UPLOAD_RATE_WINDOW_MINUTES = _env_int('UPLOAD_RATE_WINDOW_MINUTES', 10)

    @staticmethod
    def validate():
        # Mode test sengaja tidak membutuhkan DATABASE_URL/SECRET_KEY operasional.
        if Config.TESTING:
            return

        if not Config.SQLALCHEMY_DATABASE_URI:
            raise ValueError(
                "DATABASE_URL tidak ditemukan. "
                "Pastikan file backend/.env sudah dibuat dan berisi DATABASE_URL."
            )
        if not os.getenv('SECRET_KEY'):
            raise ValueError(
                "SECRET_KEY tidak ditemukan. "
                "Tambahkan SECRET_KEY ke file backend/.env kamu."
            )
