# PRD — Kaji: AI Business Model Validator (MVP)

## 1. Product Overview

Aplikasi web yang membantu **founder tahap awal menguji ide startup sebelum membangunnya**. Founder menuliskan ide dalam 1–3 paragraf; Kaji menghasilkan laporan validasi terstruktur, melengkapinya dengan riset kompetitor dan pasar yang bersumber dari web, lalu membiarkan founder bertanya lanjut dan mencoba skenario "kalau begini bagaimana".

AI berperan sebagai **analis yang skeptis, bukan cheerleader**. Ia mencari bukti, menyebut kelemahan, dan memberi skor dengan rubric tetap. Keputusan lanjut, pivot, atau berhenti tetap di tangan founder.

Tagline: **Kaji dulu, baru bangun.**

## 2. Target User

**Primary user:** founder tahap awal di Indonesia yang punya ide tetapi belum punya cara sistematis untuk memvalidasinya — first-time founder maupun indie hacker yang menguji banyak ide.

Founder cukup menuliskan idenya dan langsung mendapatkan laporan lengkap tanpa mengisi form panjang atau membuat akun.

## 3. Core Product

### A. Laporan Validasi

Satu laporan dengan sembilan bagian yang urutannya selalu sama:

- Ringkasan & verdict (Proceed / Proceed with caution / Pivot / Stop)
- Masalah & solusi
- Target customer
- Pasar (TAM/SAM/SOM sebagai rentang, dengan asumsi dan tingkat keyakinan)
- Kompetitor & diferensiasi
- Model bisnis & pricing
- Go-to-market
- Risiko
- Asumsi kritis & eksperimen untuk mengujinya

Setiap bagian punya skor 0–100 dan alasan. Skor keseluruhan dihitung di kode dengan bobot tetap, bukan oleh AI. Laporan muncul bertahap, bagian demi bagian, dalam waktu di bawah 90 detik.

### B. Research Agent (grounding)

Bagian **Kompetitor** dan **Pasar** tidak dijawab dari ingatan model. Agent mencari web secara live, membuka halaman kompetitor, dan menyertakan sumber untuk setiap klaim.

**Ide → Normalizer → Pipeline analisis (paralel) → Research agent mencari web → Critic → Laporan**

Agent:
1. Membaca ide yang sudah dinormalisasi (masalah, solusi, customer, monetisasi, wilayah).
2. Menyusun 2–3 query pencarian, memprioritaskan sumber Indonesia bila wilayahnya Indonesia.
3. Membuka halaman kompetitor untuk mengambil harga dan positioning.
4. Menulis bagian laporan dengan nama, URL, dan harga nyata, plus daftar sumber.
5. Jika tidak menemukan apa pun, menulis "tidak menemukan" dan menandai bagian sebagai tidak bersumber — bukan mengarang.

Contoh:

> **Ide:** "Aplikasi langganan untuk pemilik kos: pengingat tagihan via WhatsApp, pencatatan pembayaran, laporan bulanan. Rp 99.000/bulan."
>
> **Kompetitor & Diferensiasi — skor 48**
>
> Pasar sudah terisi. Kompetitor langsung: Mamikos Pengelola (gratis, distribusi ke ribuan pemilik kos) [1], Kostkita dan RumahKos.id (Rp 50–150 ribu/bulan) [2][3]. Substitusi paling umum: spreadsheet dan pengingat WhatsApp manual.
>
> Moat belum terlihat; pengingat otomatis sudah menjadi komoditas. Diferensiasi yang mungkin: integrasi pembayaran dan laporan pajak untuk pemilik 20+ kamar.
>
> **Sumber:** [1] mamikos.com/pengelola · [2] kostkita.id/harga · [3] rumahkos.id — diakses 7 Sep 2026

### C. Asumsi Kritis & Eksperimen

Setiap laporan diakhiri dengan 5–8 asumsi yang harus benar agar ide berhasil, diurutkan dari yang paling fatal. Setiap asumsi disertai cara mengujinya minggu ini: metode, metrik sukses, estimasi hari, dan estimasi biaya dalam Rupiah.

Contoh:

> **Asumsi 1 (fatal):** Pemilik kos mau membayar Rp 99.000/bulan padahal Mamikos Pengelola gratis.
>
> **Uji:** landing page + tombol pre-order; 15 wawancara pemilik kos 10–50 kamar.
>
> **Sukses jika:** ≥ 5 dari 15 bersedia membayar di muka. **Estimasi:** 10 hari, ~Rp 2 juta.

### D. Chat Lanjutan & What-if

Founder bisa bertanya lanjut di bawah laporan. AI punya konteks seluruh laporan dan bisa mencari web lagi bila perlu.

Untuk pertanyaan yang mengubah asumsi — harga, segmen, biaya akuisisi — AI menghitung ulang bagian yang terpengaruh dan menampilkan **delta**, bukan menimpa laporan asli.

Contoh:

> **Founder:** "Kalau harganya Rp 49.000/bulan bagaimana?"
>
> **Kaji:** Dengan retensi tetap 18 bulan, LTV turun dari Rp 1,78 juta ke Rp 882 ribu dan rasio LTV/CAC dari 3,0 ke 1,5 — di bawah ambang sehat. Harga rendah juga tidak otomatis memenangkan pasar karena kompetitor utama gratis.
>
> **Perubahan:**
> - Model bisnis · harga/bulan: Rp 99.000 → Rp 49.000
> - Model bisnis · LTV: Rp 1,78 juta → Rp 882 ribu
> - Model bisnis · skor: 60 → 52
> - Skor keseluruhan: 62 → 59
>
> Laporan asli tidak diubah.

### E. Ekspor & Riwayat

- Ekspor PDF lengkap dengan daftar sumber, untuk co-founder atau mentor
- Tautan berbagi read-only (opt-in, alamat tidak bisa ditebak)
- Riwayat laporan di perangkat yang sama (tanpa akun)

## 4. Kualitas & Evaluasi

Kualitas laporan diuji secara sistematis, bukan dirasa-rasa.

- **Golden set 20 ide** — 5 kuat, 5 sedang, 5 jelas buruk, 5 kasus tepi (kabur, ilegal, terlalu luas, sudah jenuh). Setiap ide punya rentang verdict yang diharapkan dan kompetitor yang wajib disebut (misalnya Mamikos untuk ide kos).
- **Pemeriksaan otomatis** — laporan lolos skema, punya 5–8 asumsi, bebas frasa generik ("pasar yang besar dan berkembang"), verdict dalam rentang, kompetitor wajib disebut, sitasi hidup.
- **LLM-as-judge** — spesifisitas, sikap kritis, actionability, dan konsistensi antar bagian, skala 1–5.
- **Regression** — dijalankan setiap prompt atau model berubah; hasilnya ditampilkan di halaman eval dan disertakan di README.

Target MVP: rubric rata-rata ≥ 4.0, semua ide "jelas buruk" mendapat Stop/Pivot, ≥ 90% sitasi valid, laporan lengkap ≤ 90 detik, biaya ≤ USD 0.15 per laporan.

## 5. MVP Scope

Fokus pada **alur validasi inti** dari satu ide sampai founder tahu apa yang harus diuji lebih dulu.

**MVP (14 hari):**
1. Form input ide (1–3 paragraf, field lain opsional)
2. Laporan 9 bagian yang muncul bertahap (streaming)
3. Research agent dengan web search dan sitasi untuk Kompetitor dan Pasar
4. Skor per dimensi, skor keseluruhan, dan verdict
5. Asumsi kritis & eksperimen
6. Chat lanjutan dengan what-if dan delta
7. Ekspor PDF dan tautan berbagi
8. Riwayat laporan sederhana
9. Golden set, eval otomatis, dan halaman eval

**Ditunda setelah MVP:** pertanyaan klarifikasi untuk ide kabur, bandingkan 2–3 ide, feedback 👍/👎 per bagian, skenario what-if tersimpan, regenerate per bagian, akun dan tim, upload dokumen.

**Catatan teknis:** pnpm monorepo (Hono API, React + TanStack Router, package agent); Anvia untuk agent, tool, structured output, dan streaming; Tavily untuk search; BullMQ + Redis untuk pipeline di background; PostgreSQL + Prisma; Langfuse untuk tracing. Versi Anvia dikunci di satu seri sejak hari pertama. Dikerjakan dengan AI coding assistant.

## 6. Key Product Principle

**AI mencari bukti dan bersikap kritis; founder yang memutuskan.**

Sistem harus membuat founder:
- Lebih cepat melihat kelemahan idenya sendiri
- Tahu siapa kompetitornya dengan nama dan harga nyata, bukan tebakan
- Tahu asumsi mana yang harus diuji lebih dulu dan bagaimana caranya
- Percaya pada laporan karena setiap klaim bisa dilacak ke sumbernya dan kualitasnya diukur terbuka
