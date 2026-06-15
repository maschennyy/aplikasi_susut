# Security Baseline

Tahap pertama pengamanan aplikasi sudah berfokus pada kontrol yang paling berdampak.

## Kontrol Aktif

- Login berbasis session Flask.
- Password disimpan memakai hash Werkzeug.
- Role awal: `admin`, `operator`, `viewer`, `auditor`.
- Route aplikasi dan API otomatis membutuhkan login.
- Endpoint upload/import hanya untuk `admin` dan `operator`.
- CSRF token untuk semua request POST/PUT/PATCH/DELETE.
- Header keamanan dasar:
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Content-Security-Policy`
- Batas ukuran upload lewat `MAX_UPLOAD_MB`.
- Validasi ekstensi dan signature file untuk upload Excel.
- Audit log untuk login, gagal login, logout, analisa NKWh, import NKWh, dan import penyulang.
- Rate limit sederhana untuk percobaan login gagal.
- Rate limit sederhana untuk upload/import.
- Password policy minimal panjang dan variasi karakter.
- Halaman admin `Security` untuk manajemen user dan audit log.

## Bootstrap Admin

Pilihan 1, lewat `.env` sebelum aplikasi pertama kali dijalankan:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password-kuat
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@example.local
```

Pilihan 2, lewat CLI:

```bash
flask --app app create-admin
```

## Variabel Keamanan

```text
SECURITY_REQUIRE_LOGIN=true
SESSION_COOKIE_SECURE=false
PERMANENT_SESSION_HOURS=8
MAX_UPLOAD_MB=25
MAX_IMPORT_ROWS=20000
PASSWORD_MIN_LENGTH=10
LOGIN_RATE_LIMIT=5
LOGIN_RATE_WINDOW_MINUTES=15
LOGIN_LOCKOUT_MINUTES=15
UPLOAD_RATE_LIMIT=10
UPLOAD_RATE_WINDOW_MINUTES=10
```

Untuk deployment HTTPS, ubah:

```text
SESSION_COOKIE_SECURE=true
```

## Tahap Berikutnya

- Approval workflow untuk import data besar.
- Backup database otomatis.
- Reverse proxy HTTPS dan pembatasan akses lewat VPN/internal network.
- Rate limit berbasis Redis/gateway untuk deployment multi-worker.
