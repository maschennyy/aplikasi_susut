# Aplikasi Monitoring Susut Energi

Root project ini adalah aplikasi frontend Next.js. Backend Flask berjalan terpisah sebagai package Python di folder `backend/`.

## Struktur

```text
.
├── src/                         # Frontend Next.js
├── backend/                     # Backend Flask REST API
├── package.json                 # Script frontend dan helper backend
├── next.config.ts               # Rewrite ke Flask backend
├── .env.local.example           # Template konfigurasi frontend
└── backend/.env.example         # Template konfigurasi backend
```

## Persiapan Environment

Salin template frontend:

```bash
cp .env.local.example .env.local
```

Pada Windows Command Prompt:

```cmd
copy .env.local.example .env.local
```

Untuk development lokal, gunakan:

```env
FLASK_API_BASE_URL=http://127.0.0.1:5000
```

Salin template backend lalu isi koneksi database dan secret:

```bash
cp backend/.env.example backend/.env
```

Pada Windows Command Prompt:

```cmd
copy backend\.env.example backend\.env
```

## Menjalankan Development

Terminal 1, jalankan backend Flask melalui entry point package-safe:

```bash
npm run backend
```

Perintah tersebut menjalankan:

```bash
python -m backend.entrypoint
```

Terminal 2, jalankan frontend Next.js:

```bash
npm run dev
```

Frontend tersedia di `http://127.0.0.1:3000`.
Backend tersedia di `http://127.0.0.1:5000`.

## Menjalankan Test Backend

Pastikan dependency Python sudah terpasang, kemudian jalankan dari root repository:

```bash
npm run backend:test
```

Test otomatis memakai:

```env
APP_ENV=test
TEST_DATABASE_URL=sqlite+pysqlite:///:memory:
```

Database PostgreSQL pada `DATABASE_URL` tidak digunakan selama test. Suite test memeriksa:

- startup Flask;
- pembuatan tabel inti pada SQLite sementara;
- endpoint CSRF dan security headers;
- endpoint sidebar stats;
- identitas package/import backend;
- rumus susut bulanan dan kumulatif tanpa EMIN.

GitHub Actions menjalankan suite yang sama secara otomatis ketika file backend terkait berubah pada push atau pull request.

## Seed Data Development

```bash
npm run backend:seed
```

Seed menghapus sejumlah tabel sebelum mengisi data contoh. Jangan jalankan perintah ini pada database operasional.

## Menjalankan dengan Gunicorn

```bash
gunicorn backend.entrypoint:app
```

## Konfigurasi Production

Frontend mengakses Flask melalui rewrite Next.js:

```text
Browser → /flask-api → Next.js rewrite → backend Flask
```

Pada environment production frontend, `FLASK_API_BASE_URL` wajib berisi URL publik backend tanpa akhiran `/api`:

```env
FLASK_API_BASE_URL=https://backend-aplikasi-susut.example.com
```

Jangan mengisi:

```env
FLASK_API_BASE_URL=https://backend-aplikasi-susut.example.com/api
```

karena `next.config.ts` sudah menambahkan `/api` pada rewrite.

Build production akan dihentikan ketika `FLASK_API_BASE_URL` kosong atau tidak valid. Pada Vercel production, alamat `localhost`, `127.0.0.1`, dan `::1` juga ditolak karena tidak dapat menjangkau server Flask di luar deployment frontend.

## Dependency Backend

```bash
pip install -r backend/requirements.txt
```
