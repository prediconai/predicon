# PREDICON AI — Repository Audit & Development Baseline Report

**Tanggal Audit:** 30 Oktober 2026  
**Auditor:** Senior Full-Stack Engineer  
**Sumber Arsip:** `Predion.zip` (5 file) + `Prorisk v.1.0.zip` (8 file)  
**Status:** AUDIT SAJA — tidak ada perubahan kode dilakukan  

---

## 1. Ringkasan Kondisi Repository

Dua arsip ditemukan dan dianalisis:

### 1.1 Arsip Predion (Baseline PREDICON AI saat ini)

Arsip `Predion.zip` berisi **5 file** yang membentuk aplikasi web monolitik sederhana:

| File | Ukuran | Peran |
|---|---|---|
| `index.html` | 18 KB | Frontend lengkap: UI, navigasi, chat AI demo, KPI simulasi, dark mode |
| `server.js` | 19 baris | Backend Express: health check, endpoint AI chat, JWT auth, rate limiting, static serving |
| `package.json` | 1 baris | Dependency: express, helmet, express-rate-limit, jsonwebtoken |
| `Dockerfile` | 8 baris | Container Node 20-alpine, build context |
| `.env.example` | 3 baris | Template env vars: ANTHROPIC_API_KEY, SUPABASE_JWT_SECRET, ANTHROPIC_MODEL |

**Kondisi umum:**
- Aplikasi berjalan sebagai single-page Express app
- Frontend (index.html) memiliki 12 menu navigasi, dashboard dengan data simulasi, chat AI dalam mode demo
- Backend memiliki endpoint `/api/ai/chat` yang terhubung ke Anthropic API dengan retry dan timeout
- **Nama produk masih "PREDION" di seluruh codebase** — perlu rebrand ke "PREDICON AI"
- **Tidak ada `public/` directory** di arsip, tetapi Dockerfile menyalin `public/` dan `server.js` melayani `express.static('public')` — ini **bug kritis**
- `index.html` ada di root, bukan di dalam `public/` — Docker build akan gagal atau frontend tidak akan terbuka
- **Tidak ada file `railway.json`** di arsip Predion (ada di arsip ProRisk sebagai referensi)
- **Tidak ada migrasi database**, tidak ada konfigurasi Supabase, tidak ada RLS
- **Tidak ada integrasi pembayaran** (hanya dialog "Upgrade belum aktif" yang menyebut Midtrans)
- **Tidak ada CI/CD**, tidak ada automated tests, tidak ada `.gitignore`
- **Tidak ada package-lock.json** di arsip

### 1.2 Arsip ProRisk (Referensi/Upgrade Path)

Arsip `Prorisk v.1.0.zip` berisi **8 file** — campuran frontend besar dan kode referensi backend:

| File | Ukuran | Peran |
|---|---|---|
| `prorisk-v1.html` | 302 KB | Frontend ProRisk lengkap: 20 halaman, dark enterprise UI, modul AI, payment adapter, event bus, observability |
| `download-prorisk.html` | ~15 KB | Halaman download yang meng-embed `prorisk-v1.html` sebagai base64 blob |
| `digium-ai-gateway.routes.js` | 178 baris | **Kode referensi** Express router untuk AI gateway (3 endpoint: risk-analysis, chat, report) |
| `railway-health.routes.js` | 82 baris | **Kode referensi** untuk health/readiness/liveness + graceful shutdown |
| `002_digium_pass2_tables.sql` | 112 baris | **SQL referensi** 3 tabel Supabase: dkc_sync_queue, events_log, ai_request_log + RLS |
| `railway.json` | 15 baris | Konfigurasi Railway: Dockerfile builder, healthcheck, restart policy |
| `PRODUCTION_AUDIT_PASS2.md` | 80 baris | Laporan audit internal ProRisk Pass 2 |
| `digium-pass2.env.example` | 27 baris | Template env vars ProRisk: AI gateway, DKC, feature flags, payment |

**Kondisi umum ProRisk:**
- Frontend jauh lebih matang (302KB vs 18KB) — 20 halaman vs 12 menu
- Memiliki arsitektur modular: RiskAIClient, PaymentAdapter, EventBus, Observability, MiniDKC, DKCSyncQueue, DigiumXClient
- Semua AI call sudah dirutekan melalui gateway (tidak ada direct client-to-Anthropic)
- PaymentAdapter mendukung 7 provider (midtrans aktif, 6 stub termasuk xendit)
- **Namun: `liveAI:false`** — semua masih dalam mode demo
- **Tier system masih client-side** (`localStorage`) — paywall bisa di-bypass via devtools
- Backend reference files ditandai "REFERENCE / STARTER CODE" — perlu di-merge manual
- Tidak ada backend aktual yang terhubung

---

## 2. Daftar File Penting dan Perannya

### 2.1 File Predion (PREDICON AI saat ini)

| File | Baris | Peran | Status |
|---|---|---|---|
| `index.html` | 125 | Frontend SPA: header, sidebar nav (12 menu), dashboard, chat AI, KPI simulasi, dark mode, responsif | **Aktif, berfungsi** — brand masih "PREDION" |
| `server.js` | 18 | Express server: helmet CSP, JWT auth, rate limit per-tier, endpoint `/api/ai/chat` → Anthropic, health check, static files | **Aktif** — `liveAI:false` di frontend, endpoint ada tapi tidak dipanggil |
| `package.json` | 1 | Manifest: name=predion, 4 dependencies, node>=20 | **Aktif** — nama package masih "predion" |
| `Dockerfile` | 8 | Image: node:20-alpine, copy package.json→npm install→copy server.js→copy public→run | **BUG** — `public/` tidak ada di arsip |
| `.env.example` | 3 | Template: ANTHROPIC_API_KEY, SUPABASE_JWT_SECRET, ANTHROPIC_MODEL | **Referensi** — belum ada vars untuk payment, database, observability |

### 2.2 File ProRisk (Referensi)

| File | Baris | Peran | Status |
|---|---|---|---|
| `prorisk-v1.html` | ~1400+ | Frontend enterprise: 20 halaman, radar charts, tape, chaos score, advisor AI, simulator, workspace, reports | **Aktif sebagai demo** — liveAI:false, tier di localStorage, payment stub |
| `digium-ai-gateway.routes.js` | 177 | Express router: 3 AI endpoints dengan retry, timeout, correlation ID, observability hooks | **Referensi** — belum di-merge ke server.js |
| `railway-health.routes.js` | 81 | Health/readiness/liveness + graceful shutdown dengan SIGTERM/SIGINT | **Referensi** — belum di-merge |
| `002_digium_pass2_tables.sql` | 111 | 3 tabel Supabase + RLS policies + trigger | **Referensi** — belum dijalankan |
| `railway.json` | 15 | Railway deploy config: Dockerfile builder, healthcheck /health, 5 retries | **Referensi** — belum ada di Predion |
| `digium-pass2.env.example` | 27 | Env vars lengkap: AI gateway, DKC, feature flags, payment | **Referensi** — lebih lengkap dari Predion's .env.example |

---

## 3. Matriks Fitur ProRisk → PREDICON AI

| # | Fitur ProRisk | Status di ProRisk | Status di Predion (PREDICON AI) | Rekomendasi | Alasan |
|---|---|---|---|---|---|
| 1 | Intelligence Dashboard | Aktif (simulasi) | Aktif (simulasi, lebih sederhana) | **Pertahankan** Predion UI | UI Predion lebih ringan dan cocok sebagai baseline; ProRisk terlalu kompleks untuk fase awal |
| 2 | Asisten AI / AI Advisor | Stub (liveAI:false, RiskAIClient→/api/ai/*) | Aktif (CFG.liveAI:false, endpoint `/api/ai/chat`) | **Pertahankan & integrasikan** | Backend Predion sudah punya endpoint AI yang berfungsi; ProRisk punya 3 endpoint (risk-analysis, chat, report) — pilih satu sebagai baseline |
| 3 | Opportunity Intelligence | Aktif (simulasi) | Aktif (simulasi, 3 item) | **Pertahankan** | Sudah ada di kedua versi |
| 4 | Risk Radar / Risk Intelligence | Aktif (simulasi, chaos score, radar chart) | Aktif (simulasi, gauge sederhana) | **Pertahankan** Predion UI | Predion lebih sederhana; ProRisk punya radar chart yang bagus tapi terlalu berat |
| 5 | Market Intelligence | Aktif (tape, indeks, tren) | Aktif (indeks, tren, indikator) | **Pertahankan** | Sudah ada di kedua versi |
| 6 | Country Intelligence | Aktif (10 negara, data simulasi) | Aktif (menu ada, konten simulasi generik) | **Pertahankan** | Menu ada di Predion; konten bisa diperkaya nanti |
| 7 | Signal Center / Early Warning | Aktif (10 engine monitoring, alert settings) | Tidak ada | **Perlu integrasi** | Fitur Pro value-add; implementasi bertahap |
| 8 | Scenario Simulator | Aktif (Business tier, simulasi variabel) | Tidak ada | **Perlu integrasi** | Fitur Business tier; butuh backend untuk kalkulasi |
| 9 | Reports / Laporan | Aktif (generate, share, export) | Aktif (menu ada, konten simulasi generik) | **Pertahankan** | Menu ada di Predion |
| 10 | AI Agents | Tidak ada di ProRisk | Aktif (menu ada, stub) | **Tidak digunakan** | Tidak ada di ProRisk; hapus atau implementasi nanti |
| 11 | Knowledge Library / Knowledge Base | Aktif (Knowledge Base) | Aktif (menu ada, stub) | **Pertahankan** stub | Menu ada di Predion; ProRisk punya DKC sync queue (stub) |
| 12 | Settings / Pengaturan | Aktif (subscription, preferensi) | Aktif (menu ada, stub) | **Pertahankan** | Menu ada di Predion |
| 13 | Industry Intelligence | Aktif (Pro tier, persona-based) | Tidak ada eksplisit | **Perlu integrasi** | Fitur Pro; bisa ditambahkan ke menu Predion |
| 14 | Capital Flow Intelligence | Aktif (foreign flow monitor) | Tidak ada | **Perlu integrasi** | Fitur khusus; implementasi bertahap |
| 15 | Institutional Intelligence | Aktif (institutional data) | Tidak ada | **Perlu integrasi** | Fitur khusus; implementasi bertahap |
| 16 | Narrative Intelligence | Aktif (Pro tier, narrative analysis) | Tidak ada | **Perlu integrasi** | Fitur Pro; implementasi bertahap |
| 17 | Calendar & Timeline | Aktif (event calendar) | Tidak ada | **Perlu integrasi** | Fitur berguna; implementasi bertahap |
| 18 | Market Forecast | Aktif (forecast charts) | Tidak ada | **Perlu integrasi** | Fitur berguna; implementasi bertahap |
| 19 | Macro Exposure Map | Aktif (exposure heatmap) | Tidak ada | **Perlu integrasi** | Fitur khusus; implementasi bertahap |
| 20 | Portfolio Monitor | Aktif (portfolio tracking) | Tidak ada | **Perlu integrasi** | Fitur Business; implementasi bertahap |
| 21 | Decision Engine (So What) | Aktif (Pro tier, so-what analysis) | Tidak ada | **Perlu integrasi** | Fitur Pro; butuh AI backend |
| 22 | Action Intelligence | Aktif (action items) | Tidak ada | **Perlu integrasi** | Fitur berguna; implementasi bertahap |
| 23 | Intelligence Workspace | Aktif (Business tier) | Tidak ada | **Perlu integrasi** | Fitur Business; implementasi bertahap |
| 24 | Executive Briefing | Aktif (Pro tier, delivery settings) | Tidak ada | **Perlu integrasi** | Fitur Pro; implementasi bertahap |
| 25 | Payment Adapter | Stub (Midtrans aktif, 6 stub incl. Xendit) | Tidak ada (dialog "belum aktif") | **Perlu integrasi backend** | ProRisk punya adapter client-side; Predion belum punya sama sekali |
| 26 | Tier System (Free/Pro/Business) | Client-side (localStorage, bypassable) | Tidak ada (Paket Free hardcoded) | **Perlu integrasi backend** | Harus server-side entitlement |
| 27 | EventBus (18 events) | Aktif (in-memory buffer) | Tidak ada | **Perlu integrasi backend** | Persistensi ke backend diperlukan |
| 28 | Observability (6 log buckets) | Aktif (in-memory, console) | Tidak ada | **Perlu integrasi backend** | Log ke database diperlukan |
| 29 | DKC Sync Queue | Stub (manual workflow, no auto-sync) | Tidak ada | **Tidak digunakan** (untuk sekarang) | Terlalu kompleks; defer ke fase jauh |
| 30 | DigiumXClient | Stub (6 interfaces, unimplemented) | Tidak ada | **Tidak digunakan** | Stub murni; defer sampai service ada |
| 31 | MiniDKC (cache) | Aktif (8 named stores) | Tidak ada | **Perlu integrasi** | Pattern caching yang berguna |
| 32 | CSP (Content Security Policy) | Meta-tag baseline + server helmet | Server helmet (lebih kuat) | **Pertahankan** Predion | Server-side helmet CSP lebih kuat dari meta-tag |
| 33 | Correlation ID | Aktif (X-Correlation-Id header) | Tidak ada | **Perlu integrasi** | Penting untuk observability |
| 34 | Graceful Shutdown | Aktif (SIGTERM/SIGINT, drain) | Aktif (SIGTERM only, basic) | **Perlu integrasi** | ProRisk lebih lengkap |

---

## 4. Temuan Bug dan Keamanan

### 4.1 BUG KRITIS

| # | Severity | File | Temuan | Bukti |
|---|---|---|---|---|
| B1 | **KRITIS** | `Dockerfile` baris 6 | `COPY public ./public` — direktori `public/` **tidak ada** di arsip. Docker build akan gagal atau container berjalan tanpa frontend. | `ls public/` → "No such file or directory"; `index.html` ada di root, bukan di `public/` |
| B2 | **KRITIS** | `server.js` baris 17 | `app.use(express.static('public'))` — melayani dari `public/` tapi `index.html` tidak ada di sana. Frontend tidak akan terbuka di browser. | File `index.html` berada di root project, bukan di `public/index.html` |
| B3 | **TINGGI** | Seluruh codebase | Brand masih **"PREDION"** di 8 lokasi: `index.html` (meta, title, JS const, sessionStorage key), `server.js` (health check, system prompt), `package.json` (name). Aturan wajib #1 menyebut nama produk harus **PREDICON AI**. | `grep -rn 'PREDION\|predion' index.html server.js package.json` → 8 matches |
| B4 | **TINGGI** | `index.html` baris 110 | Token AI disimpan di `sessionStorage.getItem('predion_token')` — **tidak ada auth flow yang mengisi token ini**. Tidak ada login, register, atau Supabase auth di frontend. Endpoint AI akan selalu mendapat 401. | `grep 'login\|register\|supabase\|auth\.' index.html` → tidak ada hasil |
| B5 | **TINGGI** | `index.html` baris 78 | Dialog upgrade menyebut "Midtrans" sebagai payment provider, tapi tidak ada implementasi Midtrans atau Xendit di mana pun. | Tidak ada kode payment di server.js atau index.html selain teks dialog |

### 4.2 BUG SEDANG

| # | Severity | File | Temuan | Bukti |
|---|---|---|---|---|
| B6 | **SEDANG** | `server.js` baris 5 | Health check mengembalikan `product:'predion'` — tidak konsisten dengan nama produk PREDICON AI. | `server.js` baris 5 |
| B7 | **SEDANG** | `server.js` baris 10 | System prompt AI menyebut "PREDION" bukan "PREDICON AI". | `server.js` baris 10 |
| B8 | **SEDANG** | `server.js` baris 8 | `auth` middleware hanya verifikasi JWT dengan `SUPABASE_JWT_SECRET`. Tidak ada validasi apakah user masih aktif, tidak ada pengecekan tier dari database — tier dibaca dari `app_metadata` JWT tapi tidak ada mekanisme yang mengisinya. | `const tier=u=>(u.app_metadata&&u.app_metadata.tier)||'free'` |
| B9 | **SEDANG** | `server.js` baris 9 | Rate limiter menggunakan `keyGenerator:q=>q.user.sub` — ini akan crash jika `auth` middleware gagal dan `q.user` undefined (meskipun auth melempar 401, urutan middleware `auth,limiter` berarti limiter tidak jalan jika auth gagal — aman secara teori, tapi rapuh). | Urutan: `app.post('/api/ai/chat',auth,limiter,async(q,r)=>{...})` |
| B10 | **SEDANG** | `index.html` baris 80 | `CFG.liveAI:false` — AI tidak aktif di frontend. Endpoint backend ada tapi tidak dipanggil. | `const CFG={liveAI:false,...}` |
| B11 | **SEDANG** | `.env.example` | Hanya 3 env vars. Tidak ada PORT, tidak ada vars untuk Supabase URL, payment, observability, staging. | File hanya berisi 3 baris |

### 4.3 KEAMANAN

| # | Severity | Area | Temuan | Bukti |
|---|---|---|---|---|
| S1 | **TINGGI** | Autentikasi | **Tidak ada autentikasi yang berfungsi**. Frontend tidak punya login/register. Backend expect JWT dari Supabase tapi tidak ada Supabase client atau config. | Tidak ada `@supabase/supabase-js` di package.json; tidak ada kode auth di frontend |
| S2 | **TINGGI** | Entitlement | Tier system tidak ada di Predion. Backend membaca tier dari JWT `app_metadata` tapi tidak ada yang mengisinya. | `const tier=u=>(u.app_metadata&&u.app_metadata.tier)||'free'` — selalu 'free' |
| S3 | **SEDANG** | CSP | Helmet CSP memperbolehkan `'unsafe-inline'` untuk script-src. Ini diperlukan karena inline script di index.html, tapi idealnya dipindahkan ke file eksternal. | `scriptSrc:["'self'","'unsafe-inline'"]` |
| S4 | **RENDAH** | Rate Limiting | Rate limiter 24 jam window (864e5 ms) — sangat longgar. 10 request/hari untuk free tier. | `windowMs:864e5,limit:q=>LIM[tier(q.user)]||10` |
| S5 | **RENDAH** | Secret Management | `.env.example` kosong (tidak ada nilai) — ini benar. Tapi tidak ada `.gitignore` yang mencegah `.env` dengan nilai masuk ke repo. | Tidak ada `.gitignore` di arsip |
| S6 | **INFO** | Dependency Security | `npm audit` menunjukkan **0 vulnerabilities** untuk 4 dependencies. | `npm audit` → "found 0 vulnerabilities" |
| S7 | **TINGGI** | ProRisk paywall bypass | ProRisk menyimpan tier di `localStorage` (`rr_tier`) — bisa di-bypass via devtools. Ini diwariskan jika ProRisk pattern diadopsi. | `var USER_TIER = localStorage.getItem('rr_tier') \|\| 'free'` |

---

## 5. Status Platform — Railway, Cloudflare, Supabase, AI, Xendit

### 5.1 Railway

| Item | Status | Bukti |
|---|---|---|
| `railway.json` | **TIDAK ADA di arsip Predion** | File hanya ada di arsip ProRisk sebagai referensi |
| Health check | Ada di `server.js` (`/health`) tapi mengembalikan `product:'predion'` | `server.js` baris 5 |
| Readiness/Liveness | **TIDAK ADA** | ProRisk reference punya, belum di-merge |
| Graceful shutdown | Ada (SIGTERM only, basic) | `server.js` baris 18 |
| Docker build context | **Bermasalah** — `COPY public ./public` gagal karena `public/` tidak ada | `Dockerfile` baris 6 |
| Start command | `node server.js` | `package.json` scripts.start, `Dockerfile` CMD |
| Railway verified | **BELUM TERVERIFIKASI** — tidak ada akses ke Railway dashboard |

### 5.2 Cloudflare

| Item | Status | Bukti |
|---|---|---|
| Konfigurasi Cloudflare | **TIDAK ADA** di kedua arsip | Tidak ada file konfigurasi, wrangler.toml, atau referensi |
| DNS/SSL/CDN | **BELUM TERVERIFIKASI** | Tidak ada akses ke Cloudflare dashboard |
| CSP enforcement | Server-side via Helmet (Predion), meta-tag (ProRisk) | Helmet CSP lebih kuat |

### 5.3 Supabase

| Item | Status | Bukti |
|---|---|---|
| Supabase client library | **TIDAK ADA** di dependencies | `package.json` tidak punya `@supabase/supabase-js` |
| Supabase URL | **TIDAK ADA** di env vars | `.env.example` hanya punya `SUPABASE_JWT_SECRET` |
| Database migrations | **TIDAK ADA** di arsip Predion | ProRisk punya `002_digium_pass2_tables.sql` (referensi) |
| RLS policies | **TIDAK ADA** di arsip Predion | ProRisk SQL referensi punya RLS untuk 3 tabel |
| Auth (login/register) | **TIDAK ADA** di frontend atau backend | Tidak ada kode auth di index.html atau server.js |
| Persistensi percakapan | **TIDAK ADA** | Chat history hanya di array JS (`msgs=[]`), hilang saat refresh |
| Entitlement/tier | **TIDAK ADA** yang berfungsi | Backend baca dari JWT app_metadata tapi tidak ada yang mengisi |
| Supabase verified | **BELUM TERVERIFIKASI** — tidak ada akses ke Supabase project |

### 5.4 Integrasi AI

| Item | Status | Bukti |
|---|---|---|
| Endpoint AI | **ADA di backend** (`/api/ai/chat`) | `server.js` baris 11-16 |
| Provider | Anthropic (Claude) | `fetch('https://api.anthropic.com/v1/messages')` |
| API Key | Dari `ANTHROPIC_API_KEY` env var, **server-side only** — aman | `server.js` baris 13 |
| Model | `claude-sonnet-4-6` (default) | `.env.example` |
| Retry + timeout | Ada (3 retry, 20s timeout, backoff 400ms×attempt) | `server.js` baris 13-15 |
| Frontend integration | **ADA tapi nonaktif** (`CFG.liveAI:false`) | `index.html` baris 80 |
| System prompt | Ada, menyebut "PREDION" (perlu rebrand) | `server.js` baris 10 |
| Input validation | Ada (max 12 messages, max 2000 chars per message) | `server.js` baris 12 |
| Correlation ID | **TIDAK ADA** (ProRisk reference punya) | ProRisk `digium-ai-gateway.routes.js` |
| AI request logging | **TIDAK ADA** | Tidak ada tabel `ai_request_log` di Predion |
| AI verified | **TERVERIFIKASI sebagian** — kode backend ada dan lolos `node --check`, tapi belum diuji end-to-end karena `liveAI:false` |

### 5.5 Integrasi Xendit (dan Pembayaran Umum)

| Item | Status | Bukti |
|---|---|---|
| Xendit SDK/library | **TIDAK ADA** di dependencies | `package.json` tidak punya xendit |
| Checkout flow | **TIDAK ADA** | Tidak ada kode checkout di frontend atau backend |
| Webhook handler | **TIDAK ADA** | Tidak ada endpoint webhook di server.js |
| Transaction recording | **TIDAK ADA** | Tidak ada tabel transaksi, tidak ada migration |
| Entitlement after payment | **TIDAK ADA** | Tidak ada mekanisme upgrade tier setelah pembayaran |
| UI | Dialog "Upgrade belum aktif" yang menyebut Midtrans | `index.html` baris 78 |
| ProRisk PaymentAdapter | **STUB** — Midtrans aktif (gatewayCall ke `/api/payment/midtrans/create`), Xendit = `stubProvider('xendit')` | `prorisk-v1.html` — `stubProvider` returns unimplemented interface |
| Xendit verified | **BELUM TERVERIFIKASI** — tidak ada implementasi di mana pun |

---

## 6. Daftar Environment Variables yang Diperlukan

### 6.1 Variabel yang Sudah Ada di `.env.example` (Predion)

| Variabel | Fungsi | Wajib? |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key untuk Anthropic Claude (server-side only, tidak pernah diekspos ke klien) | Ya (untuk AI) |
| `SUPABASE_JWT_SECRET` | Secret untuk verifikasi JWT dari Supabase Auth | Ya (untuk auth) |
| `ANTHROPIC_MODEL` | Model Claude yang digunakan (default: `claude-sonnet-4-6`) | Tidak (ada default) |

### 6.2 Variabel Tambahan yang Diperlukan (Belum Ada)

| Variabel | Fungsi | Sumber Referensi |
|---|---|---|
| `PORT` | Port server Express (default: 3000) | `server.js` baris 18: `P.PORT\|\|3000` |
| `SUPABASE_URL` | URL project Supabase untuk client connection | Standar Supabase |
| `SUPABASE_ANON_KEY` | Anon key untuk client-side Supabase | Standar Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key untuk operasi admin (server-side only) | Standar Supabase |
| `XENDIT_SECRET_API_KEY` | API key Xendit untuk checkout (server-side only) | Xendit docs |
| `XENDIT_WEBHOOK_TOKEN` | Token verifikasi webhook Xendit | Xendit docs |
| `PAYMENT_ACTIVE_PROVIDER` | Provider pembayaran aktif (`xendit` atau `midtrans`) | ProRisk env.example |
| `AI_GATEWAY_TIMEOUT_MS` | Timeout untuk AI gateway request (default: 20000) | ProRisk env.example |
| `AI_GATEWAY_MAX_RETRIES` | Max retry untuk AI gateway (default: 2) | ProRisk env.example |
| `FEATURE_LIVE_AI` | Flag aktifkan AI live (default: false) | ProRisk env.example |
| `NODE_ENV` | Environment (`production`/`staging`/`development`) | Standar Express |
| `LOG_LEVEL` | Level logging (`info`/`warn`/`error`/`debug`) | Standar observability |
| `SENTRY_DSN` | DSN untuk Sentry error tracking (opsional) | ProRisk audit mention Sprint 1 |
| `RAILWAY_VOLUME_MOUNT_PATH` | Path untuk persistent storage di Railway (opsional) | Railway docs |

> **Catatan:** Nilai tidak ditampilkan sesuai aturan #7. Semua nilai harus diisi di Railway variables atau `.env` production, tidak di-commit ke repo.

---

## 7. Daftar Pekerjaan Berdasarkan Prioritas dan Dependensi

### P0 — Kritis (Wajib sebelum apa pun)

| # | Pekerjaan | Dependensi | Estimasi |
|---|---|---|---|
| P0.1 | **Perbaiki Dockerfile**: Pindahkan `index.html` ke `public/index.html` ATAU ubah `server.js` untuk `express.static('.')` + ubah Dockerfile `COPY public ./public` → `COPY . .` | Tidak ada | Kecil |
| P0.2 | **Rebrand "PREDION" → "PREDICON AI"** di 8 lokasi: index.html (meta, title, JS const BRAND, sessionStorage key), server.js (health check, system prompt), package.json (name) | Tidak ada | Kecil |
| P0.3 | **Tambah `.gitignore`** untuk mencegah `.env`, `node_modules/`, `package-lock.json` (jika tidak diinginkan) masuk repo | Tidak ada | Kecil |

### P1 — Fondasi (Wajib sebelum fitur)

| # | Pekerjaan | Dependensi | Estimasi |
|---|---|---|---|
| P1.1 | **Setup Supabase**: tambah `@supabase/supabase-js` dependency, buat client, tambah env vars (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) | P0.2 | Sedang |
| P1.2 | **Implementasi auth flow**: login/register di frontend (Supabase Auth), isi `predion_token` ke sessionStorage, kirim sebagai Bearer token ke backend | P1.1 | Sedang |
| P1.3 | **Database migration baseline**: buat tabel `users` (profile), `conversations` (chat history), `transactions` (payment), `subscriptions` (entitlement) + RLS | P1.1 | Sedang |
| P1.4 | **Server-side entitlement**: ganti baca tier dari JWT app_metadata → query ke tabel `subscriptions` di Supabase | P1.3 | Sedang |
| P1.5 | **Persistensi percakapan**: simpan chat history ke tabel `conversations`, load saat user login | P1.3 | Sedang |
| P1.6 | **Aktifkan AI live**: set `CFG.liveAI=true` setelah auth flow berfungsi (token diisi) | P1.2 | Kecil |

### P2 — Integrasi Pembayaran

| # | Pekerjaan | Dependensi | Estimasi |
|---|---|---|---|
| P2.1 | **Integrasi Xendit checkout**: endpoint `/api/payment/xendit/create` untuk membuat invoice, return URL checkout | P1.4 | Sedang |
| P2.2 | **Webhook handler Xendit**: endpoint `/api/payment/xendit/webhook` dengan verifikasi token, update `transactions` + upgrade `subscriptions` tier | P2.1, P1.4 | Sedang |
| P2.3 | **UI checkout**: ganti dialog "Upgrade belum aktif" dengan flow checkout Xendit sebenarnya | P2.1 | Sedang |
| P2.4 | **Entitlement after payment**: setelah webhook sukses, update tier user di `subscriptions`, JWT refresh dengan tier baru | P2.2, P1.4 | Sedang |

### P3 — Observability & Deployment

| # | Pekerjaan | Dependensi | Estimasi |
|---|---|---|---|
| P3.1 | **Merge `railway-health.routes.js`**: tambah /readiness, /liveness, graceful shutdown | P0.1 | Kecil |
| P3.2 | **Tambah `railway.json`** ke repo Predion (dari ProRisk referensi, sesuaikan) | P3.1 | Kecil |
| P3.3 | **Correlation ID**: tambah middleware X-Correlation-Id (dari ProRisk reference) | P3.1 | Kecil |
| P3.4 | **AI request logging**: buat tabel `ai_request_log` (dari ProRisk SQL), persist log AI requests | P1.1, P3.3 | Sedang |
| P3.5 | **Events log**: buat tabel `events_log` (dari ProRisk SQL), persist event audit trail | P1.1 | Sedang |
| P3.6 | **CI pipeline**: GitHub Actions untuk lint, test, build, deploy ke Railway staging | P3.2 | Sedang |
| P3.7 | **Automated tests**: unit test untuk server.js endpoints, integration test untuk auth + AI | P1.6 | Sedang |

### P4 — Pengayaan Fitur (Bertahap)

| # | Pekerjaan | Dependensi | Estimasi |
|---|---|---|---|
| P4.1 | Signal Center (alert monitoring) | P1.6 | Besar |
| P4.2 | Scenario Simulator | P1.4 | Besar |
| P4.3 | Industry Intelligence (persona-based) | P1.6 | Besar |
| P4.4 | Calendar & Timeline | P1.1 | Sedang |
| P4.5 | Market Forecast | P1.6 | Besar |
| P4.6 | Decision Engine (So What) | P1.6 | Besar |
| P4.7 | Executive Briefing | P1.6 | Besar |

---

## 8. Hasil Tes Aktual dan Tes yang Belum Dijalankan

### 8.1 Tes yang Dijalankan

| # | Tes | Perintah | Hasil |
|---|---|---|---|
| T1 | Validasi sintaks `server.js` | `node --check server.js` | **LOLOS** (exit 0, no errors) |
| T2 | Validasi sintaks `digium-ai-gateway.routes.js` | `node --check digium-ai-gateway.routes.js` | **LOLOS** (exit 0, no errors) |
| T3 | Validasi sintaks `railway-health.routes.js` | `node --check railway-health.routes.js` | **LOLOS** (exit 0, no errors) |
| T4 | Dependency security audit | `npm i --package-lock-only && npm audit` | **0 vulnerabilities** (4 deps: express, express-rate-limit, helmet, jsonwebtoken) |
| T5 | Cek direktori `public/` | `ls public/` | **GAGAL** — direktori tidak ada (konfirmasi bug B1) |
| T6 | Cek nama brand | `grep -rn 'PREDION\|predion'` | **8 lokasi** masih menggunakan "PREDION" (konfirmasi bug B3) |
| T7 | Cek integrasi auth | `grep 'login\|register\|supabase' index.html` | **TIDAK ADA** hasil (konfirmasi bug B4) |
| T8 | Cek integrasi payment | `grep 'xendit\|midtrans\|payment' index.html` | Hanya teks dialog, **tidak ada kode** (konfirmasi bug B5) |
| T9 | Cek Node.js version | `node --version` | v22.22.2 (memenuhi requirement >=20) |
| T10 | Cek file count arsip Predion | `find predion -type f` | 5 file (index.html, server.js, package.json, Dockerfile, .env.example) |
| T11 | Cek file count arsip ProRisk | `find prorisk -type f` | 8 file |

### 8.2 Tes yang Belum Dapat Dijalankan

| # | Tes | Alasan Tidak Dapat Dijalankan |
|---|---|---|
| U1 | Docker build (`docker build .`) | Docker tidak tersedia di environment audit |
| U2 | Server start (`npm start`) + health check | Tidak ada `.env` dengan nilai; ANTHROPIC_API_KEY dan SUPABASE_JWT_SECRET kosong |
| U3 | Endpoint AI end-to-end (`POST /api/ai/chat`) | Membutuhkan API key Anthropic yang valid + JWT Supabase yang valid |
| U4 | Railway deployment | Tidak ada akses ke Railway dashboard/project |
| U5 | Supabase connection + migration | Tidak ada akses ke Supabase project |
| U6 | Xendit checkout flow | Tidak ada Xendit API key |
| U7 | Webhook Xendit | Tidak ada endpoint publik + Xendit webhook token |
| U8 | Cloudflare DNS/SSL | Tidak ada akses ke Cloudflare dashboard |
| U9 | CI/CD pipeline | Belum ada pipeline yang dibuat |
| U10 | Automated tests (unit/integration) | Belum ada test suite yang dibuat |
| U11 | Frontend rendering (browser preview) | Tidak dapat membuka browser untuk verifikasi visual |

---

## 9. Rekomendasi Implementasi Tahap Berikutnya

### Tahap 1 — Stabilisasi (P0 + P3.1 + P3.2)

1. **Perbaiki Dockerfile** — pindahkan `index.html` ke `public/index.html` atau ubah Dockerfile/server.js agar konsisten
2. **Rebrand "PREDION" → "PREDICON AI"** di semua file
3. **Tambah `.gitignore`**
4. **Merge health/readiness/liveness** dari ProRisk reference ke server.js
5. **Tambah `railway.json`** ke repo

**Hasil:** Aplikasi bisa di-build Docker dan deploy ke Railway dengan health check yang proper.

### Tahap 2 — Autentikasi & Database (P1)

1. Tambah `@supabase/supabase-js` dependency
2. Setup Supabase project: buat tabel (users, conversations, transactions, subscriptions) + RLS
3. Implementasi login/register di frontend
4. Server-side entitlement (baca tier dari database, bukan JWT)
5. Persistensi chat history
6. Aktifkan `liveAI:true`

**Hasil:** User bisa login, chat dengan AI, dan chat history tersimpan. Tier diatur server-side.

### Tahap 3 — Pembayaran (P2)

1. Integrasi Xendit checkout (endpoint create invoice)
2. Webhook handler dengan verifikasi
3. UI checkout flow
4. Entitlement upgrade otomatis setelah pembayaran

**Hasil:** User bisa upgrade dari Free → Pro → Business via Xendit, tier di-update otomatis.

### Tahap 4 — Observability & CI (P3)

1. Correlation ID middleware
2. AI request logging ke database
3. Events log
4. CI/CD pipeline (GitHub Actions → Railway staging)
5. Automated tests

**Hasil:** Setiap request AI tercatat, event audit trail tersimpan, deploy otomatis via CI.

### Tahap 5 — Pengayaan Fitur (P4)

Implementasi bertahap fitur dari ProRisk yang belum ada di Predion, sesuai prioritas bisnis. Mulai dari yang paling berdampak: Signal Center, Scenario Simulator, Decision Engine.

---

## 10. Daftar File yang Diubah

**Tidak ada file yang diubah.** Audit ini bersifat read-only. Semua temuan di atas adalah rekomendasi yang menunggu persetujuan sebelum implementasi.

---

## Penutup

PREDICON AI **belum siap produksi**. Beberapa blocking issue harus diselesaikan terlebih dahulu:

1. **Docker build broken** (public/ directory missing) — aplikasi tidak akan bisa di-deploy
2. **Tidak ada autentikasi** — tidak ada login/register, endpoint AI akan selalu 401
3. **Tidak ada database** — chat history tidak tersimpan, tier tidak diatur
4. **Tidak ada pembayaran** — tidak ada Xendit/Midtrans implementation
5. **Brand masih "PREDION"** — melanggar aturan wajib #1

Setelah Tahap 1-3 di atas diselesaikan dan diverifikasi, PREDICON AI dapat dilanjutkan ke tahap pengayaan fitur dan persiapan produksi.

---

*Audit selesai. Menunggu persetujuan untuk memulai implementasi Tahap 1.*
