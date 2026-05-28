import os
from dotenv import load_dotenv

# Muat variabel dari file .env
load_dotenv()

class Config:
    # Koneksi database — dibaca dari .env, bukan hardcoded
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Secret key — dibaca dari .env
    SECRET_KEY = os.getenv('SECRET_KEY', 'fallback-key-ganti-ini')
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
    PERMANENT_SESSION_HOURS = int(os.getenv('PERMANENT_SESSION_HOURS', '8'))

    # Guardrail upload dan akses aplikasi.
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_UPLOAD_MB', '25')) * 1024 * 1024
    MAX_IMPORT_ROWS = int(os.getenv('MAX_IMPORT_ROWS', '20000'))
    SECURITY_REQUIRE_LOGIN = os.getenv('SECURITY_REQUIRE_LOGIN', 'true').lower() == 'true'
    PASSWORD_MIN_LENGTH = int(os.getenv('PASSWORD_MIN_LENGTH', '10'))
    LOGIN_RATE_LIMIT = int(os.getenv('LOGIN_RATE_LIMIT', '5'))
    LOGIN_RATE_WINDOW_MINUTES = int(os.getenv('LOGIN_RATE_WINDOW_MINUTES', '15'))
    LOGIN_LOCKOUT_MINUTES = int(os.getenv('LOGIN_LOCKOUT_MINUTES', '15'))
    UPLOAD_RATE_LIMIT = int(os.getenv('UPLOAD_RATE_LIMIT', '10'))
    UPLOAD_RATE_WINDOW_MINUTES = int(os.getenv('UPLOAD_RATE_WINDOW_MINUTES', '10'))

    # Validasi: pastikan DATABASE_URL tidak kosong saat startup
    @staticmethod
    def validate():
        if not os.getenv('DATABASE_URL'):
            raise ValueError(
                "DATABASE_URL tidak ditemukan. "
                "Pastikan file .env sudah dibuat dan berisi DATABASE_URL."
            )
        if not os.getenv('SECRET_KEY'):
            raise ValueError(
                "SECRET_KEY tidak ditemukan. "
                "Tambahkan SECRET_KEY ke file .env kamu."
            )
