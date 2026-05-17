import os

class Config:
    # Koneksi PostgreSQL
    SQLALCHEMY_DATABASE_URI = 'postgresql://postgres:Unsada2026@localhost:5432/losses_app_db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = 'rahasia-super-secret-key-123'  # Ganti dengan string random