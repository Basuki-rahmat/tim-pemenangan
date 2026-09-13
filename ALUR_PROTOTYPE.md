# Alur Prototype Sistem Rekapitulasi Form C1 & Persamaan Implementasi di Hosting

> Dokumen ini menjelaskan **alur kerja prototype** yang berjalan di localhost (Laragon) dan **bagaimana alur yang sama dipertahankan saat di-deploy ke hosting production** (rekomendasi: Biznet Gio). Prinsip utamanya: **kode 100% identik, yang berubah hanya infrastruktur dan file `.env`**.

---

## 1. Gambaran Umum

Sistem ini dirancang untuk menerima data rekapitulasi Form C1 dari saksi di ±29.000 TPS secara bersamaan (target hingga 29.000 request/detik) tanpa membuat server atau database overload. Prototype sudah terverifikasi end-to-end di localhost: **26.264 job sukses, 0 gagal, 289.930 baris detail suara, respons submit < 20ms**.

Tiga aturan utama yang menjadi fondasi alur:

1. **Server Node.js tidak pernah menerima file gambar** — gambar diunggah browser langsung ke Object Storage (S3) via *Presigned URL*.
2. **API tidak pernah insert langsung ke MySQL** — semua data teks masuk ke antrean Redis (BullMQ) terlebih dahulu.
3. **Worker menulis ke MySQL secara batch** — 500 transaksi sekaligus dalam satu transaksi SQL, bukan satu-per-satu.

---

## 2. Komponen Prototype (Localhost Laragon)

| Komponen | Lokasi di Project | Peran di Prototype |
|---|---|---|
| **Frontend** (HTML/JS) | `frontend/index.html` | Panel admin + simulasi saksi: upload gambar C1, kirim data suara, dashboard rekap |
| **API Producer** (Express.js) | `api/src/` | Validasi payload, generate Presigned URL, push job ke antrean, endpoint rekapitulasi |
| **Redis + BullMQ** | Layanan Laragon `:6379` | Message queue `c1-queue` sebagai bantalan (buffer) antara API dan database |
| **Worker DB** (Node.js) | `worker/worker-db.js` | Konsumsi antrean, BATCH INSERT ke MySQL |
| **Worker OCR** (Python) | `worker/ocr_worker.py` | Simulasi batch inference AI pembaca angka C1 (multi-template Pilkada/Pileg/DPD), auto-detect GPU dengan fallback CPU |
| **MinIO** (S3-Compatible) | `start-minio.bat`, `:9000` | Object storage lokal untuk foto Form C1 (bucket `c1-uploads`) |
| **MySQL** | Layanan Laragon `:3306` | Database `db_pemilu_c1` (5 tabel InnoDB, indeks minimal, tanpa FK CASCADE) |
| **Nginx Load Balancer** | `nginx/c1-loadbalancer.conf` | Konfigurasi LB + rate limiting (di prototype mengarah ke `127.0.0.1:3000/3001`) |
| **Skrip Uji** | `e2e-test.js`, `stress-test.js`, `loadtest_multi_pemilu.js` | Uji alur end-to-end dan uji beban (autocannon) |

---

## 3. Alur Data Prototype (Step-by-Step)

### 3.1 Alur Unggah Form C1 (Saksi)

```text
[Browser Saksi]
   │
   │ (1) GET /api/c1/upload-request
   ▼
[API Express :3000] ──▶ generate Presigned PUT URL (berlaku 300 detik)
   │
   │ (2) Browser PUT file gambar LANGSUNG ke MinIO (gambar tidak lewat Node.js)
   ▼
[MinIO :9000]  (bucket c1-uploads, image_key tersimpan)
   │
   │ (3) POST /api/c1/submit  (JSON teks: tps_id, kategori, image_key,
   │      suara_sah, suara_tidak_sah, detail_suara[])
   ▼
[API Express :3000] ──▶ validasi payload (< 20ms, tanpa query MySQL)
   │                     queue.add('process-c1', payload)
   ▼
[Redis :6379]  (antrean BullMQ "c1-queue")
   │
   │ (4) API langsung balas 200 "Data berhasil masuk antrean"
   │     → saksi tidak menunggu proses database
   ▼
[Worker : Node.js] ──▶ kumpulkan job di buffer
   │                    flush saat buffer 500 job ATAU tiap 1 detik
   │ (5) Satu transaksi SQL: BATCH INSERT transaksi_c1 + detail_suara
   │     (commit / rollback jika gagal, job dikembalikan ke buffer)
   ▼
[MySQL :3306]  (db_pemilu_c1)
```

### 3.2 Alur Dashboard / Rekapitulasi (Publik & Admin)

1. Browser memanggil `GET /api/c1/rekapitulasi` (atau tab Dashboard Admin yang auto-refresh tiap 4 detik).
2. API menjalankan query analitik (SUM/COUNT/GROUP BY) melalui **readPool** (`api/src/db.js`) — terpisah dari writePool, sehingga query berat tidak mengganggu primary DB yang sedang menerima batch insert.
3. Endpoint admin (wilayah, kandidat, dapil, TPS, saksi) menggunakan **writePool** dengan autentikasi Bearer token (`/api/auth/login`).

### 3.3 Alur OCR (Saat Ini: Simulasi)

1. Setiap transaksi tersimpan dengan `status_ocr = 0` (pending) dan `image_url` menunjuk ke objek MinIO.
2. `worker/ocr_worker.py` siap menerima pipeline gambar: ambil antrean → unduh gambar dari S3 → batch inference 16–32 gambar → update `status_ocr`.
3. Di prototype, modul ini baru berupa **dry-run/simulasi multi-template** (GPU CUDA dideteksi otomatis, fallback CPU). Inferensi model asli butuh server GPU (Issue #6).

### 3.4 Bukti Alur Berjalan (Hasil Uji Lokal)

- `node e2e-test.js` → presigned URL (~1–8ms) → PUT gambar ke MinIO → submit JSON masuk antrean.
- `npm run stress` (autocannon 100 koneksi) → antrean terdrain worker tanpa error.
- Log worker: `[FLUSH] BATCH INSERT 500 transaksi + N detail suara | durasi ...ms`.

---

## 4. Persamaan Implementasi di Hosting (Production)

### 4.1 Yang TIDAK Berubah (Persamaan Utama)

Seluruh kode aplikasi dipakai apa adanya di hosting — tidak ada perubahan logika:

| Aspek | Prototype (Laragon) | Hosting (Biznet Gio) | Status |
|---|---|---|---|
| Kode API Express (`api/`) | `node src/server.js` | `node src/server.js` (via PM2/systemd) | ✅ Identik |
| Endpoint & alur presigned URL | `GET /api/c1/upload-request` → PUT MinIO | Endpoint sama → PUT NEO Object Storage | ✅ Identik |
| Validasi + push antrean (`POST /api/c1/submit`) | `queue.add('process-c1')` | Sama persis | ✅ Identik |
| Nama antrean BullMQ | `c1-queue` | `c1-queue` | ✅ Identik |
| Logika batch insert worker | Buffer 500 / flush 1 detik, 2 batch insert dalam 1 transaksi | Sama persis | ✅ Identik |
| Skema database (`db/schema.sql`) | `db_pemilu_c1`, 5 tabel InnoDB | Sama, diimpor ke MySQL Primary | ✅ Identik |
| Frontend (HTML/JS) | Diserve Express static | Diserve Nginx / Load Balancer | ✅ Identik (hanya host) |
| Konfigurasi Nginx LB | Upstream `127.0.0.1:3000/3001` | Upstream diisi IP private VM `10.0.2.x` | ✅ File sama, tambah baris server |

**Satu-satunya yang diubah adalah file `.env`:**

```env
# Prototype (Laragon)              →  Hosting (Biznet Gio VPC Private)
DB_HOST=127.0.0.1                  →  DB_HOST=10.0.1.10        (MySQL Primary)
DB_REPLICA_HOST=(kosong=primary)   →  DB_REPLICA_HOST=10.0.1.20 (MySQL Replica)
REDIS_HOST=127.0.0.1               →  REDIS_HOST=10.0.3.10      (Redis Cluster)
S3_ENDPOINT=http://127.0.0.1:9000  →  S3_ENDPOINT=https://nos.biznetgio.com (NEO Object Storage)
```

### 4.2 Pemetaan Komponen: Prototype → Hosting

| Prototype | Di Hosting | Catatan |
|---|---|---|
| MinIO lokal (1 proses) | **NEO Object Storage (S3-Compatible)**, kuota 5–10 TB | Endpoint S3 berbeda, SDK & presigned URL sama |
| MySQL Laragon (1 instance) | **MySQL Primary + Replica** (2 VM, 32 vCPU/128 GB, SSD NVMe ≥10.000 IOPS) | Write pool → Primary, readPool → Replica (sudah disiapkan di `api/src/db.js`) |
| Redis Laragon (1 instance) | **Redis Cluster** (3 VM, 8 vCPU/32 GB, master-slave) | Cukup ganti `REDIS_HOST` |
| 1 proses API Express | **15–20 VM API** (4 vCPU/8 GB) di belakang Load Balancer | File `nginx/c1-loadbalancer.conf` sudah siap: tinggal buka komentar baris `server 10.0.2.x:3000` |
| Nginx conf lokal | **NEO Load Balancer / Nginx VM** dengan rate limiting sama (10 r/s submit, 50 r/s read per IP) | Rate limit & gzip dipertahankan |
| 1 proses worker | Beberapa instance worker paralel (konsumsi antrean yang sama) | BullMQ memastikan 1 job hanya diproses 1 worker |
| `ocr_worker.py` (simulasi CPU) | **Worker GPU** — NEO GPU H200 (pay-as-you-go ±Rp82.140/jam inc. PPN) atau NEO Metal T4, hanya aktif 3–5 hari Hari-H | Skrip sama, hanya `DEVICE=cuda` aktif |
| Frontend via localhost:3000 | Frontend diserve di domain publik (mis. `c1.tim-pemenangan.id`) via LB + WAF | Path API sama: `/api/...` |

### 4.3 Alur di Hosting — Persis Alur Prototype

```text
[Browser Saksi 29.000 TPS]
        │ (1) & (2) presigned URL + upload gambar langsung
        ▼
[NEO Load Balancer + WAF]  ── rate limiting 10 r/s/IP ──▶
        │ least_conn, keepalive 64
        ▼
[15–20 VM Node.js API]  ── validasi + queue.add ──▶
        ▼
[Redis Cluster 3 VM]  (c1-queue, bantalan anti-overload)
        ▼
[Worker Batch Insert]  ── 500 job / flush 1 detik ──▶
        ▼
[MySQL Primary + NVMe]  ── replikasi ──▶ [MySQL Replica]
                                              │
                                              ▼
                                   [Dashboard Publik/API rekap]
```

Setiap panah di atas adalah **proses yang sama** dengan yang sudah berjalan di localhost — hanya jumlah instansinya yang dibesarkan (horizontal scaling).

### 4.4 Strategi Hidup-Hidup (Hybrid) yang Dipertahankan

- **Hari-H (3–5 hari):** semua server besar dinyalakan (pay-as-you-go hourly), trafik puncak 29.000 TPS ditampung.
- **Masa normal (11 bulan):** server besar dimatikan, data dimigrasi ke VPS kecil via `migrate-c1-db.sh` (dump → checksum SHA-256 → restore → verifikasi COUNT/CHECKSUM → switchover `.env`). Kode aplikasi tetap sama, cukup ganti `DB_HOST` ke VPS harian.

---

## 5. Ringkasan Satu Paragraf

> Prototype ini mensimulasikan sistem rekapitulasi Form C1 skala nasional di localhost: browser saksi mengunggah foto Form C1 **langsung ke object storage** (MinIO) memakai Presigned URL dari API, lalu mengirim data suara berbentuk JSON ke `POST /api/c1/submit` yang hanya memvalidasi dan memasukkan payload ke **antrean Redis (BullMQ)** dalam hitungan milidetik. Worker terpisah mengambil job dari antrean dan menulisnya ke MySQL secara **batch 500 transaksi per detik** dalam satu transaksi SQL, sedangkan dashboard membaca hasil rekap melalui koneksi read-replica yang terisolasi. Saat di-deploy ke hosting (Biznet Gio), **alur dan seluruh kode tidak berubah sama sekali** — MinIO digantikan NEO Object Storage, MySQL lokal digantikan kluster Primary+Replica, Redis lokal digantikan Redis Cluster, dan satu proses API digandakan menjadi 15–20 VM di balik Nginx/NEO Load Balancer dengan rate limiting yang sudah disiapkan di konfigurasi. Yang diubah hanya file `.env` (arah IP private VPC) dan skala hardware — plus server GPU pay-as-you-go yang hanya menyala 3–5 hari saat Hari-H untuk pipeline OCR.


Isi ringkasnya:

Struktur dokumen:
1. Gambaran umum — 3 aturan utama arsitektur (gambar tidak pernah melewati Node.js, API tidak pernah insert langsung ke MySQL, worker menulis secara batch)
2. Komponen prototype — tabel pemetaan folder ( api/ ,  worker/ ,  frontend/ ,  db/ ,  nginx/ ) ke perannya masing-masing
3. Alur data step-by-step — diagram alur upload C1 (presigned URL → PUT MinIO → submit JSON → Redis queue → batch insert MySQL), alur dashboard via read-replica, alur OCR (simulasi), plus bukti hasil uji lokal (26.264 job, 0 gagal)
4. Persamaan implementasi di hosting — bagian inti permintaan Anda:
- Tabel "yang TIDAK berubah": kode, endpoint, nama queue, logika batch, skema DB semuanya identik
- Contoh perubahan  .env  saja ( DB_HOST ,  REDIS_HOST ,  S3_ENDPOINT  ke IP private VPC / NEO Object Storage)
- Pemetaan per komponen: MinIO → NEO Object Storage, MySQL lokal → Primary+Replica, Redis → Redis Cluster, 1 proses API → 15–20 VM di balik Nginx LB, OCR CPU → GPU pay-as-you-go
- Diagram alur production yang identik dengan prototype (hanya skala yang membesar)
5. Ringkasan satu paragraf — siap ditempel ke laporan/presentasi

Bagian persamaannya menyoroti fakta penting dari kode:  api/src/db.js  sudah punya  readPool / writePool  terpisah,  nginx/c1-loadbalancer.conf  sudah siap dengan baris  server 10.0.2.x  tinggal di-uncomment, dan worker BullMQ sudah aman untuk multi-instance.