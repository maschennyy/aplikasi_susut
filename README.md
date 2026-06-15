# Aplikasi Monitoring Susut Energi

Root project ini adalah aplikasi frontend Next.js. Backend Flask berjalan terpisah di folder `backend/`.

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

Terminal 1, jalankan backend Flask:

```bash
npm run backend
```

Terminal 2, jalankan frontend Next.js:

```bash
npm run dev
```

Frontend tersedia di `http://127.0.0.1:3000`.
Backend tersedia di `http://127.0.0.1:5000`.

## Konfigurasi

- Frontend: `.env.local`
- Backend: `backend/.env`

Jika backend belum punya dependency Python:

```bash
pip install -r backend/requirements.txt
```
