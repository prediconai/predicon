# PREDICON AI — Stabilization & Security Hardening Report

**Tanggal:** 30 Oktober 2026
**Tahap:** P0 Stabilization → P1 Core Integration → Production Verification
**Engineer:** Senior Full-Stack / Security / DevOps

---

## 1. Ringkasan Perubahan

Sesi ini melakukan hardening menyeluruh terhadap proyek PREDICON AI, melampaui pekerjaan sebelumnya dengan menambahkan:

- **Nonce-based CSP** — menghapus `'unsafe-inline'` dari `script-src`, menggantinya dengan nonce per-request
- **JWT issuer/audience validation** — dukungan untuk `SUPABASE_JWT_ISSUER` dan `SUPABASE_JWT_AUDIENCE`
- **Server-side logout** — endpoint `POST /api/auth/logout` yang memanggil Supabase untuk revoke token
- **Conversation grouping** — skema `conversations` + `messages` (bukan flat table lagi)
- **Pagination** — semua endpoint riwayat mendukung `?page=N&limit=M`
- **Burst rate limiter** — 10 request/menit per IP, di atas daily limit per-user
- **Partial save consistency** — user message disimpan sebelum AI call, assistant message disimpan setelah; jika AI gagal, tidak ada fake assistant message
- **Env injection** — server menginject `window.__ENV` dengan Supabase URL + anon key (tidak ada secret)
- **Centralized error handler** — middleware yang menangkap semua unhandled errors tanpa membocorkan internals
- **Comprehensive test suite** — 46 tests (dari 20 sebelumnya), mencakup CSP nonce, pagination, burst limit, logout, env injection

---

## 2. File yang Dibuat, Diubah, dan Dihapus

### File Diubah

| File | Perubahan | Alasan |
|---|---|---|
| `server.js` | **Major rewrite** | Nonce CSP, JWT issuer/audience, server-side logout, conversation+messages schema, pagination, burst limiter, partial save consistency, env injection, error handler |
| `public/index.html` | **Moderate update** | Server-side logout call, conversation_id tracking, `/api/history` endpoint, `/api/auth/logout` endpoint, currentConversationId variable |
| `migrations/001_conversations.sql` | **Rewritten** | Two-table schema (conversations + messages), trigger for updated_at, indexes, RLS policies for both tables, verification queries |
| `.env.example` | **Updated** | Added `SUPABASE_JWT_ISSUER` and `SUPABASE_JWT_AUDIENCE` vars with documentation |
| `test.js` | **Rewritten** | 46 tests (up from 20), categorized as MOCK/SECURITY, covers all 15 required test areas |

### File Tidak Berubah (Sudah Benar)

| File | Status |
|---|---|
| `package.json` | Tidak diubah — dependencies sudah lengkap |
| `Dockerfile` | Tidak diubah — sudah konsisten dengan struktur |
| `railway.json` | Tidak diubah — healthcheck `/health` sudah benar |
| `.gitignore` | Tidak diubah — sudah melindungi `.env`, `node_modules/` |

### File Dihapus

Tidak ada file yang dihapus.

---

## 3. Status Setiap Tahap

### Tahap 1 — Health/Readiness

| Pemeriksaan | Status | Detail |
|---|---|---|
| `/health` merespons | **LULUS** | 200, `{status:'ok', product:'predicon-ai'}` |
| `/ready` membedakan configured vs not | **LULUS** | 503 jika ada config yang hilang, 200 jika semua ada |
| Static file dari direktori benar | **LULUS** | `public/` dengan `index: false` untuk HTML injection |
| Error tidak bocor stack trace | **LULUS** | Centralized error handler + helmet |
| Graceful shutdown | **LULUS** | SIGTERM/SIGINT, 10s force-exit |
| Docker/Railway konsisten | **LULUS** | Entrypoint, EXPOSE 3000, healthcheck `/health` |
| `.gitignore` melindungi secret | **LULUS** | `.env`, `.env.*` (kecuali `.env.example`) |

### Tahap 2 — Autentikasi Supabase & JWT

| Pemeriksaan | Status | Detail |
|---|---|---|
| Supabase config separation | **LULUS** | URL+anon key di browser, service role+JWT secret di server |
| Frontend login/register | **LULUS** | Dialog dengan tab Masuk/Daftar, Supabase Auth REST API |
| Logout server-side | **LULUS** | `POST /api/auth/logout` calls Supabase `/auth/v1/logout`, then clears local state |
| JWT signature verification | **LULUS** | `jwt.verify()` dengan `SUPABASE_JWT_SECRET` |
| JWT algorithm restriction | **LULUS** | `algorithms: ['HS256']` — HS384/RS256 rejected |
| JWT expiry check | **LULUS** | `jwt.verify()` otomatis reject expired tokens |
| JWT issuer validation | **LULUS** | `SUPABASE_JWT_ISSUER` env var (opsional, recommended) |
| JWT audience validation | **LULUS** | `SUPABASE_JWT_AUDIENCE` env var (opsional) |
| JWT sub claim required | **LULUS** | `if (!req.user.sub) return 401` |
| No server secrets in browser | **LULUS** | Service role key, JWT secret hanya di server |
| Token validation on init | **LULUS** | `initAuth()` calls `/api/history` untuk validate token |
| Login/register end-to-end | **BELUM DIVERIFIKASI** | Butuh Supabase project aktif |

### Tahap 3 — Database, RLS, Riwayat Chat

| Pemeriksaan | Status | Detail |
|---|---|---|
| Migration tersedia | **LULUS** | `migrations/001_conversations.sql` — idempotent |
| Conversations table | **LULUS** | `id, user_id, created_at, updated_at` |
| Messages table | **LULUS** | `id, conversation_id, user_id, role, content, created_at` |
| Content length constraint | **LULUS** | `check (length(content) > 0 and length(content) <= 5000)` |
| FK constraints | **LULUS** | `user_id → auth.users(id)`, `conversation_id → conversations(id)` |
| Indexes | **LULUS** | 3 indexes: conversations(user_id, updated_at), messages(conversation_id, created_at), messages(user_id, created_at) |
| Trigger updated_at | **LULUS** | Auto-update conversations.updated_at on message insert |
| RLS enabled | **LULUS** | Both conversations and messages tables |
| RLS policies | **LULUS** | Select only own data via `auth.uid() = user_id` |
| No insert/update/delete via anon | **LULUS** | Service role bypasses RLS; no client-side policies |
| Conversation list endpoint | **LULUS** | `GET /api/conversations?page=1&limit=20` |
| Conversation messages endpoint | **LULUS** | `GET /api/conversations/:id?page=1&limit=50` dengan ownership check |
| Flat history endpoint | **LULUS** | `GET /api/history?page=1&limit=50` untuk backward compat |
| Pagination | **LULUS** | Semua endpoint mendukung `?page=N&limit=M` |
| Save user msg before AI | **LULUS** | Step 1: save user message → Step 2: check AI → Step 3: call AI |
| AI failure handling | **LULUS** | 502 dengan `persisted` flag, no fake assistant message |
| Save assistant msg after AI | **LULUS** | Step 5: save assistant message only if AI succeeded |
| Persistence status accurate | **LULUS** | `persisted` flag = `userMsgSaved && assistantMsgSaved` |
| Cross-user isolation | **LULUS** | RLS + explicit `user_id` filter (defense in depth) |
| Migration dijalankan di Supabase | **BELUM DIVERIFIKASI** | Butuh Supabase project |

### Tahap 4 — AI Live & Demo Mode

| Pemeriksaan | Status | Detail |
|---|---|---|
| Demo mode default | **LULUS** | `CFG.liveAI:false` di frontend |
| Demo label visible | **LULUS** | "Mode: Demo" di chat UI |
| AI live via backend only | **LULUS** | Server-side fetch to Anthropic API |
| API key server-side only | **LULUS** | `P.ANTHROPIC_API_KEY` never sent to browser |
| Input validation | **LULUS** | Array check, role check, content type/length, message count |
| Timeout | **LULUS** | 20s `AbortSignal.timeout` |
| Retry with backoff | **LULUS** | 3 attempts, 400ms × (attempt+1) delay |
| Rate limit handling | **LULUS** | 429 retried, <500 retried, others break |
| No API key in logs | **LULUS** | Error caught silently, never logged with key |
| Model from config | **LULUS** | `P.ANTHROPIC_MODEL || 'claude-sonnet-4-6'` — not from user input |
| Conversation format consistency | **LULUS** | Frontend/backend/DB semua gunakan `{role, content}` |
| AI live response | **BELUM DIVERIFIKASI** | Butuh Anthropic API key valid |

### Tahap 5 — Pengujian & Security Hardening

| Pemeriksaan | Status | Detail |
|---|---|---|
| Server start test | **LULUS** | T1, T46 |
| /ready configured & not | **LULUS** | T2 |
| Static frontend & path | **LULUS** | T3, T4, T5 |
| Token validation | **LULUS** | T6-T14, T43, T44 |
| No token / invalid / expired / wrong-claim | **LULUS** | T6-T11, T14 |
| Input validation | **LULUS** | T15-T19 |
| Rate limit | **LULUS** | T35-T37 |
| AI demo & error | **LULUS** | T20-T22 |
| Chat persistence | **LULUS** | T20 (persisted flag), T23-T26 |
| Cross-user isolation | **LULUS** | RLS + ownership check di code (T25, T26) |
| DB error & persistence status | **LULUS** | T20 (503 + persisted:false), T23-T26 (no-DB graceful) |
| CSP config | **LULUS** | T28-T30 (nonce-based, no unsafe-inline) |
| Graceful shutdown | **LULUS** | T46 |
| Docker build | **TERHALANG** | Docker tidak tersedia di environment |
| Dependency audit | **LULUS** | `npm audit` = 0 vulnerabilities |

### Security Hardening

| Temuan | Severity | Status | Perbaikan |
|---|---|---|---|
| `unsafe-inline` di CSP script-src | **SEDANG** | ✅ **DIPERBAIKI** | Nonce-based CSP, semua `<script>` mendapat `nonce` attribute |
| Token di sessionStorage | **SEDANG** | ⚠️ **TERSISA** | Lebih aman dari localStorage (hilang saat tutup tab). P2: httpOnly cookie |
| Logout tidak revoke server-side | **SEDANG** | ✅ **DIPERBAIKI** | `POST /api/auth/logout` calls Supabase logout API |
| No burst rate limit | **RENDAH** | ✅ **DIPERBAIKI** | 10 req/menit per IP burst limiter ditambahkan |
| Rate limiter memory-only | **RENDAH** | ⚠️ **TERSISA** | In-memory store, tidak global di multi-instance. P3: Redis-backed |
| No CORS policy | **RENDAH** | ⚠️ **TERSISA** | Default same-origin, aman untuk single-domain. P3 jika perlu |
| No correlation ID | **RENDAH** | ⚠️ **TERSISA** | P3: tambah X-Correlation-Id middleware |
| JWT issuer/audience tidak divalidasi | **SEDANG** | ✅ **DIPERBAIKI** | `SUPABASE_JWT_ISSUER` + `SUPABASE_JWT_AUDIENCE` env vars |
| No env injection to frontend | **RENDAH** | ✅ **DIPERBAIKI** | Server injects `window.__ENV` dengan safe public vars |
| No centralized error handler | **RENDAH** | ✅ **DIPERBAIKI** | Error handler middleware, never leaks internals |
| Partial save inconsistency | **SEDANG** | ✅ **DIPERBAIKI** | User msg saved before AI, assistant msg saved after, explicit status |

---

## 4. Status Setiap Menu dan Fitur yang Terdampak

| Menu/Feature | Status | Dampak |
|---|---|---|
| Beranda (home) | **TIDAK BERUBAH** | Tidak ada perubahan UI |
| Asisten AI (ai) | **DIPERBAIKI** | Logout server-side, conversation_id tracking, history endpoint |
| Opportunity Intelligence | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Risk Radar | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Market Intelligence | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Country Intelligence | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Signal Center | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Scenario Simulator | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Laporan | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| AI Agents | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Knowledge Library | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Pengaturan | **TIDAK BERUBAH** | Modul simulasi, tidak terdampak |
| Navigasi sidebar | **TIDAK BERUBAH** | 12 item tetap utuh |
| Layout utama | **TIDAK BERUBAH** | Grid, header, footer tetap |
| Chat UI | **TIDAK BERUBAH** | Dialog, input, send button tetap |
| Login/Register dialog | **TIDAK BERUBAH** | Tab Masuk/Daftar tetap |
| Tombol Keluar | **TIDAK BERUBAH** | Masih ada, sekarang panggil server-side logout |
| Demo mode label | **TIDAK BERUBAH** | "Mode: Demo" tetap visible |

---

## 5. Status Login, Registrasi, Logout, JWT, Database, RLS, Riwayat, AI

| Komponen | Implementasi | Verifikasi |
|---|---|---|
| Login | ✅ Supabase Auth REST API (anon key) | **BELUM DIVERIFIKASI** end-to-end (butuh Supabase project) |
| Registrasi | ✅ Supabase Auth signup | **BELUM DIVERIFIKASI** end-to-end |
| Logout | ✅ Server-side revoke + local clear | ✅ T33, T34 — endpoint bekerja dengan mock |
| JWT verification | ✅ Signature + algorithm + expiry + issuer + audience + sub | ✅ T6-T11, T14, T43, T44 — semua lulus |
| Database migration | ✅ Two-table schema + RLS + indexes + trigger | **BELUM DIVERIFIKASI** di Supabase (butuh project) |
| RLS policies | ✅ Select-only own data, service role bypass | **BELUM DIVERIFIKASI** aktif (butuh migration run) |
| Riwayat chat | ✅ List + messages + flat history dengan pagination | ✅ T23-T26, T41-T42 — mock lulus |
| AI live | ✅ Backend proxy dengan retry/timeout/validation | **BELUM DIVERIFIKASI** (butuh API key) |
| AI demo | ✅ Default, labeled | ✅ T21, T22 — lulus |

---

## 6. Integrasi yang Benar-benar Diuji

| Integrasi | Metode | Hasil |
|---|---|---|
| Server start | `node server.js` dengan mock env | ✅ Start dalam <2s |
| Health endpoint | HTTP GET `/health` | ✅ 200, `{status:'ok'}` |
| Ready endpoint | HTTP GET `/ready` | ✅ 503 when not configured |
| JWT validation (6 scenarios) | HTTP POST dengan mock JWTs | ✅ Semua ditolak/diterima dengan benar |
| Input validation (5 scenarios) | HTTP POST dengan bad input | ✅ Semua return 400 |
| CSP nonce | HTTP GET `/` header inspection | ✅ `script-src 'self' 'nonce-<random>'` |
| CSP no unsafe-inline | Header inspection | ✅ `unsafe-inline` tidak ada di script-src |
| Rate limiting (burst + daily) | 25 rapid requests | ✅ 429 setelah limit tercapai |
| Pagination | GET dengan `?page=2&limit=10` | ✅ Page/limit direfleksikan di response |
| Server-side logout | POST `/api/auth/logout` | ✅ 200, `{status:'logged_out'}` |
| Env injection | GET `/` body inspection | ✅ `window.__ENV` ada, tidak ada secret |
| SPA fallback | GET `/nonexistent` | ✅ Serves index.html |
| Static assets | express.static dengan `index:false` | ✅ CSS/JS/images terlayani |
| Secret leakage | Error response inspection | ✅ 0 matches untuk API key, service role, JWT secret |
| npm audit | `npm audit` | ✅ 0 vulnerabilities |
| Syntax check | `node --check` | ✅ server.js, test.js lolos |

---

## 7. Daftar Perintah Pengujian Beserta Hasil Aktual

```bash
# 1. Syntax check
$ node --check server.js
# Output: (no errors, exit 0)

$ node --check test.js
# Output: (no errors, exit 0)

# 2. Dependency security audit
$ npm audit
# Output: found 0 vulnerabilities

# 3. Automated test suite (46 tests, no credentials needed)
$ node test.js
# Output:
# ═══════════════════════════════════════════════════════
#   PREDICON AI — Comprehensive Automated Test Suite
# ═══════════════════════════════════════════════════════
#   ── MOCK ──
#   ✅ T1-T5 (5 tests)
#   ── SECURITY ──
#   ✅ T6-T14 (9 tests)
#   ── MOCK ──
#   ✅ T15-T26 (12 tests)
#   ── SECURITY ──
#   ✅ T27-T34 (8 tests)
#   ── MOCK ──
#   ✅ T35-T42 (8 tests)
#   ── SECURITY ──
#   ✅ T43-T44 (2 tests)
#   ── MOCK ──
#   ✅ T45-T46 (2 tests)
#   Results: 46 passed, 0 failed, 46 total
#   By category: MOCK=27 SECURITY=19
# ═══════════════════════════════════════════════════════

# 4. Docker build (TIDAK TERSEDIA)
$ docker build -t predicon-ai .
# Output: docker: command not found
# Status: TERHALANG — Docker tidak tersedia di environment

# 5. Manual smoke test
$ PORT=3000 node server.js
$ curl http://localhost:3000/health
# {"status":"ok","product":"predicon-ai"}
$ curl http://localhost:3000/ready
# {"status":"not_ready","product":"predicon-ai","checks":{...}}
```

---

## 8. Hasil Security Audit

### Temuan Diperbaiki (Sesi Ini)

| # | Temuan | Severity | Perbaikan |
|---|---|---|---|
| S1 | `unsafe-inline` di CSP script-src | SEDANG | Nonce-based CSP — per-request crypto random nonce |
| S2 | Logout tidak revoke server-side | SEDANG | `POST /api/auth/logout` calls Supabase logout API |
| S3 | No burst rate limit | RENDAH | 10 req/menit per IP burst limiter |
| S4 | JWT issuer/audience tidak divalidasi | SEDANG | `SUPABASE_JWT_ISSUER` + `SUPABASE_JWT_AUDIENCE` env vars |
| S5 | No env injection to frontend | RENDAH | Server injects `window.__ENV` dengan safe public vars |
| S6 | No centralized error handler | RENDAH | Error handler middleware, returns `{error:'internal_error'}` |
| S7 | Partial save inconsistency | SEDANG | User msg saved before AI call, assistant msg saved after, explicit `persisted` flag |
| S8 | Pagination tidak didukung | RENDAH | Semua endpoint mendukung `?page=N&limit=M` |
| S9 | No conversation grouping | RENDAH | Two-table schema: conversations + messages |

### Risiko Tersisa

| # | Temuan | Severity | Rekomendasi | Prioritas |
|---|---|---|---|---|
| R1 | Token di `sessionStorage` | SEDANG | httpOnly cookie + CSRF protection | P2 |
| R2 | Rate limiter memory-only | RENDAH | Redis-backed (`rate-limit-redis`) untuk multi-instance | P3 |
| R3 | No CORS policy eksplisit | RENDAH | Tambah CORS config jika perlu cross-origin | P3 |
| R4 | No correlation ID | RENDAH | X-Correlation-Id middleware untuk tracing | P3 |
| R5 | `style-src` masih `'unsafe-inline'` | RENDAH | Diperlukan untuk inline `<style>` — pisahkan ke CSS file di P2 | P2 |

### Verifikasi Anti-Kebocoran

| Pemeriksaan | Hasil |
|---|---|
| API key Anthropic di response? | ❌ Tidak ✅ |
| Service role key di response? | ❌ Tidak ✅ |
| JWT secret di response? | ❌ Tidak ✅ |
| Stack trace di response? | ❌ Tidak ✅ |
| File path di response? | ❌ Tidak ✅ |
| Service role key di frontend? | ❌ Tidak ✅ |
| JWT secret di frontend? | ❌ Tidak ✅ |
| `window.__ENV` berisi secret? | ❌ Tidak (hanya URL + anon key) ✅ |

---

## 9. Environment Variables yang Diperlukan

| Variabel | Fungsi | Wajib? | Server/Browser? |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | API key untuk Claude AI | Ya (untuk AI live) | Server ONLY |
| `ANTHROPIC_MODEL` | Model Claude (default: `claude-sonnet-4-6`) | Tidak | Server ONLY |
| `SUPABASE_JWT_SECRET` | Verifikasi JWT dari Supabase Auth | Ya (untuk auth) | Server ONLY |
| `SUPABASE_JWT_ISSUER` | Validasi issuer JWT (opsional, recommended) | Tidak | Server ONLY |
| `SUPABASE_JWT_AUDIENCE` | Validasi audience JWT (opsional) | Tidak | Server ONLY |
| `SUPABASE_URL` | URL project Supabase | Ya (untuk DB+auth) | Server + Browser (URL saja) |
| `SUPABASE_ANON_KEY` | Anon key untuk client-side auth | Ya (untuk auth frontend) | Browser (safe — public key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role untuk DB writes | Ya (untuk persistence) | Server ONLY — never browser |
| `PORT` | Port server (default: 3000) | Tidak | Server |
| `NODE_ENV` | Environment mode | Tidak | Server |

> **Nilai tidak ditampilkan.** Jangan commit `.env` dengan nilai asli.

---

## 10. Cara Menjalankan Aplikasi Secara Lokal

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example dan isi dengan kredensial Anda
cp .env.example .env
# Edit .env dengan Supabase URL, anon key, service role key, JWT secret, Anthropic API key

# 3. Jalankan migration di Supabase
# Buka Supabase Dashboard → SQL Editor
# Paste isi migrations/001_conversations.sql
# Klik Run

# 4. Jalankan server
npm start
# atau: node server.js

# 5. Buka browser
# http://localhost:3000

# 6. Jalankan tests (tanpa kredensial produksi)
node test.js
```

---

## 11. Langkah Migrasi dan Deployment

### Migrasi Database

1. Buka Supabase Dashboard → SQL Editor
2. Paste seluruh isi `migrations/001_conversations.sql`
3. Klik **Run**
4. Verifikasi: cek tabel `conversations` dan `messages` ada di Table Editor
5. Verifikasi RLS: cek kedua tabel memiliki "RLS Enabled" badge

### Deployment ke Railway

1. Push repository ke GitHub
2. Hubungkan repository ke Railway
3. Set environment variables di Railway Dashboard → Variables:
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL` (opsional)
   - `SUPABASE_JWT_SECRET`
   - `SUPABASE_JWT_ISSUER` (opsional, recommended)
   - `SUPABASE_JWT_AUDIENCE` (opsional)
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Railway akan build menggunakan Dockerfile (`Dockerfile` builder)
5. Healthcheck otomatis di `/health` (konfigurasi `railway.json`)

### Verifikasi Pasca-Deployment

1. Akses `https://<domain>/health` — harus return `{"status":"ok"}`
2. Akses `https://<domain>/ready` — harus return `{"status":"ready"}` dengan semua checks `true`
3. Test login: Buka aplikasi → Masuk / Daftar → verify token disimpan
4. Test chat: Login → kirim pesan → verify jawaban muncul
5. Test persistence: Kirim pesan → refresh halaman → verify history dimuat
6. Test logout: Klik "Keluar" → verify token di-clear dan server-side revoked
7. Set `CFG.liveAI:true` di `public/index.html` setelah semua diverifikasi

### Docker Build (Jika Tersedia)

```bash
docker build -t predicon-ai .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=... \
  -e SUPABASE_JWT_SECRET=... \
  -e SUPABASE_URL=... \
  -e SUPABASE_ANON_KEY=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  predicon-ai
```

---

## 12. Bagian yang Masih Membutuhkan Kredensial atau Tindakan Manual

| # | Item | Tindakan yang Diperlukan |
|---|---|---|
| M1 | Buat Supabase project | Dashboard Supabase → New Project → copy URL, anon key, service role key, JWT secret |
| M2 | Jalankan migration | Supabase SQL Editor → paste `migrations/001_conversations.sql` → Run |
| M3 | Set env vars | Set semua env vars di `.env` lokal atau Railway Variables |
| M4 | Dapatkan Anthropic API key | Anthropic Console → API Keys → buat key → set sebagai `ANTHROPIC_API_KEY` |
| M5 | Verifikasi `/ready` | Setelah deploy, akses `/ready` — harus return `status: "ready"` |
| M6 | Test login end-to-end | Buka aplikasi → Masuk → verify token disimpan → verify chat |
| M7 | Test persistence | Login → kirim pesan → refresh → verify history |
| M8 | Test logout | Klik "Keluar" → verify token cleared + server-side revoked |
| M9 | Docker build test | `docker build -t predicon-ai .` sebelum deploy |
| M10 | Set `liveAI:true` | Setelah AI + auth terverifikasi, ubah di `public/index.html` |
| M11 | Set JWT issuer (recommended) | Set `SUPABASE_JWT_ISSUER` ke `https://<project>.supabase.co/auth/v1` |

---

## 13. Batasan yang Belum Dapat Diverifikasi

| Batasan | Alasan | Risiko |
|---|---|---|
| Login/register end-to-end | Tidak ada Supabase project aktif | Implementasi sudah benar secara code, tapi belum diuji dengan auth nyata |
| AI live response | Tidak ada Anthropic API key | Endpoint ada, retry/timeout/error handling diimplementasikan, tapi belum diuji dengan AI nyata |
| Conversation persistence dengan DB nyata | Tidak ada Supabase database | Schema + RLS sudah dibuat, tapi belum dijalankan |
| RLS cross-user isolation | Tidak ada Supabase database | Policy sudah didefinisikan, tapi belum diuji dengan user berbeda |
| Docker build | Docker tidak tersedia di environment | Dockerfile ada dan konsisten, tapi belum di-build |
| Railway deployment | Tidak ada akses Railway | `railway.json` ada dan dikonfigurasi, tapi belum di-deploy |
| Rate limiter multi-instance | Tidak ada multi-instance environment | In-memory limiter bekerja di single-instance, Redis dibutuhkan untuk global |

---

## Status Akhir

| Area | Status |
|---|---|
| P0 Stabilisasi | **LULUS** |
| P1 Auth (JWT verification) | **LULUS** — 6 JWT scenarios verified |
| P1 Auth (login/register UI) | **LULUS** (code) — **BELUM DIVERIFIKASI** (end-to-end) |
| P1 Auth (server-side logout) | **LULUS** — T33, T34 |
| P1 Database migration | **LULUS** (code) — **BELUM DIVERIFIKASI** (di Supabase) |
| P1 RLS | **LULUS** (code) — **BELUM DIVERIFIKASI** (aktif) |
| P1 Conversation persistence | **LULUS** (code) — **BELUM DIVERIFIKASI** (DB nyata) |
| P1 AI Chat (endpoint) | **LULUS** — auth, validation, error handling |
| P1 AI Chat (live) | **BELUM DIVERIFIKASI** — butuh API key |
| Security hardening | **LULUS** — 9 temuan diperbaiki, 5 risiko tersisa didokumentasikan |
| CSP (nonce-based) | **LULUS** — no `unsafe-inline` di script-src |
| Automated tests | **LULUS** — 46/46 passed, 0 vulnerabilities |
| Docker build | **TERHALANG** — Docker tidak tersedia |
| Deployment | **BELUM DIVERIFIKASI** — butuh akses Railway |

**PREDICON AI belum siap produksi penuh.** Fondasi stabil dan terverifikasi (46/46 tests). Security hardening signifikan dilakukan (nonce CSP, server-side logout, JWT issuer/audience, burst limiter). Hambatan tersisa: kredensial Supabase + Anthropic untuk verifikasi end-to-end, Docker build, dan deployment.
