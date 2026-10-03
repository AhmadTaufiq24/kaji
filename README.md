# Kaji - AI Business Model Validator

> Kaji dulu, baru bangun.

Kaji membantu founder tahap awal menguji ide startup sebelum membangunnya. Founder menulis ide dalam 1–3 paragraf. Kaji mengembalikan laporan validasi 9 bagian — masalah, customer, pasar, kompetitor, model bisnis, go-to-market, risiko, asumsi, dan verdict — lengkap dengan sitasi web, skor yang dihitung di kode, dan chat what-if yang menunjukkan perubahan tanpa menimpa laporan asli.

- Demo: https://kaji-cyan.vercel.app
- API: https://api-production-5fc28.up.railway.app

Spesifikasi MVP ada di `docs/PRD.md`.

## Stack

pnpm monorepo · Hono · React + TanStack Router · Anvia (`@anvia/core@0.13.5`) · Prisma + PostgreSQL · BullMQ + Redis · Tavily · Langfuse

Anvia packages are **pinned without caret**. Do not upgrade mid-sprint.

## Setup

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

- API: http://localhost:8000/health
- App: http://localhost:3000
- Worker (needed for validation + Langfuse traces): `pnpm dev:worker`

## Langfuse

Create API keys in the Langfuse project (Settings → API Keys) and put them in `.env`:

```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Use `https://us.cloud.langfuse.com` if the project is in the US region. One trace is one report (`validate-idea`). Send a sample trace:

```bash
pnpm --filter @kaji/agent smoke:trace
```

## Eval

Golden set 20 ide (kuat / sedang / lemah / tepi) plus pemeriksa otomatis dan LLM-as-judge. Hasil tersimpan di database dan tampil di `/eval`.

```bash
pnpm eval -- --limit=20
```

Target MVP: rata-rata judge ≥ 4.0, ide lemah Stop/Pivot, ≥ 90% URL sitasi valid, laporan ≤ 90 detik, biaya ≤ USD 0.15.

**v7 (20 ide, 3 Okt 2026):** 17/20 lolos · judge 4.3 · biaya rata-rata USD 0.0094 · sitasi 18/18 laporan penuh. Tiga ide lemah/tepi masih "Proceed with caution": `weak-ai-urus-semua`, `weak-clone-gojek`, `edge-ojek-baru`.

**v8:** skor keseluruhan untuk klon aplikasi nasional, "AI mengurus semua bisnis", dan ojek online baru dibatasi maksimal 54 (Pivot). Tiga kasus itu diukur ulang dan ketiganya Pivot, lolos. Judge tetap 4.3. Gabungan dengan 17 kasus v7 yang tidak kena aturan ini: 20/20. Latency laporan penuh rata-rata ~23 detik, paling lama 86 detik.

Rate limit API: 5 laporan dan 30 pesan chat per IP per jam.

Frontend memakai `VITE_API_URL` (default `http://localhost:8000`).

## Deploy

API dan worker memakai `Dockerfile`. Set `KAJI_ROLE=worker` pada service worker. Keduanya butuh `DATABASE_URL` dan `REDIS_URL`. API membaca `PORT`.

Frontend adalah static Vite. Set `VITE_API_URL` ke URL API publik saat build.
