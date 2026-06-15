# Aplikasi Monitoring Susut Energi

Root project ini adalah aplikasi frontend Next.js. Backend Flask berjalan terpisah sebagai package Python di folder `backend/`.

## Struktur

```text
.
├── src/                  # Frontend Next.js
├── backend/              # Backend Flask REST API
├── package.json          # Script frontend dan helper backend
├── next.config.ts        # Rewrite ke Flask backend
└── .env.local            # Konfigurasi frontend
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

Dari root repository:

```bash
npm run backend:test
```

## Seed Data Development

```bash
npm run backend:seed
```

Seed menghapus sejumlah tabel sebelum mengisi data contoh. Jangan jalankan perintah ini pada database operasional.

## Menjalankan dengan Gunicorn

```bash
gunicorn backend.entrypoint:app
```

## Konfigurasi

- Frontend: `.env.local`
- Backend: `backend/.env`

Jika backend belum punya dependency Python:

```bash
pip install -r backend/requirements.txt
```
