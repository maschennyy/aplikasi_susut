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