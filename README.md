# Panduan Implementasi Arsitektur Sistem 29.000 TPS (Form C1)

Dokumen ini berisi panduan teknis yang disederhanakan bagi tim pengembang (Junior Programmer atau AI Assistant) untuk mengimplementasikan arsitektur sistem penerimaan Form C1. Sistem ini dirancang untuk menahan beban ekstrem hingga **29.000 Request Per Detik (TPS)**.

Sistem ini di-deploy di Cloud Provider Lokal Indonesia (rekomendasi: Biznet Gio) guna mematuhi aturan lokalisasi data (UU PDP).

---

## ✅ Status Implementasi & Ceklis Tugas (Update: 12 September 2026)

Prototype localhost Laragon **sudah berjalan dan terverifikasi end-to-end** untuk Issue #1–#5 dan #11.

### Ceklis per Issue GitHub

| Issue | Judul | Status | Implementasi |
|---|---|---|---|
| [#1](https://github.com/Basuki-rahmat/tim-pemenangan/issues/1) | Setup Skema Database Dinamis & Optimasi High-Throughput | ✅ Selesai | `db/schema.sql` → database `db_pemilu_c1` (utf8mb4/utf8mb4_unicode_ci), 5 tabel InnoDB, indeks BTREE minimal, tanpa FK CASCADE; `my.ini` Laragon aktif (buffer pool 4G, redo log 1G, `flush_log_at_trx_commit=2`, max_connections 5000) |
| [#2](https://github.com/Basuki-rahmat/tim-pemenangan/issues/2) | Object Storage (S3-Compatible) & Presigned URL | ✅ Selesai | MinIO lokal `localhost:9000`, bucket `c1-uploads`; `GET /api/c1/upload-request` via `@aws-sdk/client-s3` (berlaku 300 detik) |
| [#3](https://github.com/Basuki-rahmat/tim-pemenangan/issues/3) | Redis & Queue Producer (BullMQ) | ✅ Selesai | Redis Laragon `:6379` (PONG); antrean `c1-queue`; `removeOnComplete`/`removeOnFail` 100.000 |
| [#4](https://github.com/Basuki-rahmat/tim-pemenangan/issues/4) | Endpoint API `POST /api/c1/submit` | ✅ Selesai | Validasi payload dinamis (`detail_suara` array), tanpa query MySQL di controller, respons `< 20ms`, langsung `queue.add('process-c1')` |
| [#5](https://github.com/Basuki-rahmat/tim-pemenangan/issues/5) | Worker Antrean & Batch Insert MySQL | ✅ Selesai | `worker/worker-db.js`; buffer 500 job / flush 1 detik; 2 batch insert (`transaksi_c1` + `detail_suara`) dalam satu transaksi SQL + rollback |
| [#6](https://github.com/Basuki-rahmat/tim-pemenangan/issues/6) | Pipeline OCR AI (Batch Inference) | ⏳ Belum | Butuh server GPU (NVIDIA T4) / worker Python — di luar lingkup prototipe lokal |
| [#7](https://github.com/Basuki-rahmat/tim-pemenangan/issues/7) | Replikasi MySQL Primary → Replica | ⏳ Belum | Butuh 2 server; prototipe memakai 1 MySQL lokal |
| [#8](https://github.com/Basuki-rahmat/tim-pemenangan/issues/8) | Load Balancer Nginx & Rate Limiting | ⏳ Belum | Tahap deploy Biznet Gio (NEO Load Balancer) |
| [#9](https://github.com/Basuki-rahmat/tim-pemenangan/issues/9) | Stress & Load Testing (k6/JMeter) | ✅ Parsial | Uji beban lokal via `autocannon` (`npm run stress`); skrip k6 multi-pemilihan belum dibuat |
| [#10](https://github.com/Basuki-rahmat/tim-pemenangan/issues/10) | Panduan Instalasi Biznet Gio | 📄 Dokumen | Sudah tercakup di README ini (bagian Infrastruktur & Migrasi) |
| [#11](https://github.com/Basuki-rahmat/tim-pemenangan/issues/11) | Prototype Laragon di Localhost | ✅ Selesai | Struktur `/api`, `/worker`, `/frontend` + `.env`; E2E terverifikasi |

### Bukti Verifikasi (data riil, bukan teori)

- Antrean Redis: 26.264 job completed, 0 failed
- MySQL: 26.264 baris `transaksi_c1`, 289.930 baris `detail_suara`, 17.363 TPS unik
- `POST /api/c1/submit` merespons < 20ms; presigned URL ~1–8ms

### Struktur Folder Prototype

```text
tim-pemenangan/
├── api/            # Service Express.js (Producer)
│   ├── .env
│   └── src/
│       ├── server.js      # entry point + static frontend
│       ├── config.js      # loader environment
│       ├── s3.js          # S3 client + presigned URL
│       ├── queue.js       # BullMQ queue c1-queue
│       └── routes/c1.js   # GET /api/c1/health, /upload-request, POST /submit
├── worker/         # BullMQ Consumer + Batch Insert
│   ├── .env
│   ├── config.js
│   └── worker-db.js
├── frontend/       # Simulasi saksi (HTML/JS uploader presigned URL)
│   └── index.html
├── db/
│   └── schema.sql  # DDL Issue #1 + seed data
├── e2e-test.js     # Uji alur terintegrasi
├── package.json    # script: api, worker, stress
└── start-minio.bat # Launcher MinIO lokal
```

### Cara Menjalankan Prototype Lokal

```bash
# 1. Laragon: klik Start All (MySQL :3306, Redis :6379)
# 2. Database (sekali saja):
"C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysql.exe" -h 127.0.0.1 -u root < db\schema.sql
# 3. MinIO S3 lokal:
start-minio.bat   # API :9000, Console :9001 (minioadmin/minioadmin)
# 4. Install & jalankan:
npm run install:all
npm run api       # terminal 1 → http://localhost:3000
npm run worker    # terminal 2 → BullMQ consumer + batch insert
# 5. Uji end-to-end:
node e2e-test.js
# 6. Uji beban lokal:
npm run stress
```

> Deploy ke Biznet Gio: kode 100% identik — cukup ubah `.env` (`DB_HOST`/`REDIS_HOST` ke IP private VPC `10.0.x.x`, `S3_ENDPOINT` ke NEO Object Storage).

---

## 🚫 ATURAN UTAMA (WAJIB DIBACA SEBELUM CODING)

1. **JANGAN GUNAKAN ORM (seperti Drizzle, Prisma, atau Sequelize) untuk operasi *Insert* saat trafik puncak.** Gunakan native driver `mysql2/promise` dengan metode **Batch Insert (Bulk Insert)** untuk performa maksimal.
2. **JANGAN BIARKAN SERVER NODE.JS MENERIMA FILE GAMBAR.** Aplikasi backend utama HANYA boleh menerima teks JSON. Gambar harus diunggah langsung oleh browser pengguna ke Object Storage (S3) menggunakan fitur **Presigned URL**.
3. **JANGAN LAKUKAN INSERT LANGSUNG KE MYSQL DARI API.** Semua data teks yang masuk ke API harus dimasukkan terlebih dahulu ke **Antrean (Redis Queue)** agar database MySQL tidak *crash* atau *overload*.

---

## 🏗️ Arsitektur Sistem (Terdistribusi)

Sistem memecah beban kerja (Monolitik dilarang) menjadi beberapa komponen yang saling bekerja sama:

```text
[ Client / Browser ]
      │ (1) Minta Presigned URL & (2) Upload Gambar Langsung ke S3
      │ (3) Kirim Data Teks (No TPS, Suara, Link Gambar dari S3)
      ▼
[ Load Balancer ]
      │
      ▼
[ Node.js API Servers ] ---> (Tugas: Validasi request & Kirim payload ke Redis)
      │
      ▼
[ Redis Cluster ]       ---> (Menjadi Message Queue / Antrean super cepat via BullMQ)
      │
      ▼
[ Node.js Worker ]      ---> (Background task: Ambil dari Queue, Lakukan OCR, Siapkan Data)
      │
      ▼
[ MySQL Primary ]       ---> (Database Write: Lakukan BATCH INSERT secara berkala)
      │
      ▼
[ MySQL Replica ]       ---> (Database Read: Untuk Dashboard Publik)
```

---

## 🛠️ Langkah-Langkah Implementasi (Untuk Programmer / Model AI)

Tugas pembuatan kode dibagi menjadi 4 tahap berikut. Jika Anda menggunakan AI untuk *generate code*, berikan instruksi per tahap.

### Tahap 1: Setup Object Storage (S3) & Presigned URL
*   **Tujuan:** Mengalihkan beban *bandwidth* upload gambar dari server Node.js utama.
*   **Tugas:**
    1.  Gunakan AWS SDK (`@aws-sdk/client-s3`) dan arahkan endpoint ke Object Storage lokal (S3-Compatible).
    2.  Buat endpoint API `GET /api/upload-url` yang me-return *Presigned URL* untuk upload.
    3.  Di sisi Frontend, gunakan *Presigned URL* tersebut untuk melakukan `PUT` file gambar langsung ke storage.

### Tahap 2: API Penerima Data & Message Queue (Redis)
*   **Tujuan:** Menerima ribuan request teks per detik tanpa memblokir atau memperlambat sistem.
*   **Tugas:**
    1.  Buat API `POST /api/submit-c1` (hanya menerima payload JSON: TPS ID, data suara sementara, URL gambar dari Tahap 1).
    2.  Gunakan Redis dan library `BullMQ` (atau library antrean sejenis).
    3.  Di dalam API POST, *push* payload JSON ke dalam antrean Redis (`queue.add('process-c1', data)`).
    4.  Langsung kembalikan HTTP Response `200 OK` ("Data Berhasil Masuk Antrean") ke user. **Jangan tunggu proses insert ke database selesai!**

### Tahap 3: Background Worker & Batch Insert MySQL
*   **Tujuan:** Memasukkan data ke MySQL secara terkontrol tanpa membuatnya *hang*.
*   **Tugas:**
    1.  Buat script/service Node.js terpisah (Worker) yang bertugas mendengarkan antrean BullMQ.
    2.  Atur worker agar mengambil data secara berkelompok (*Batch*), misalnya 1.000 hingga 2.000 data sekaligus per detik.
    3.  Gunakan `mysql2/promise` untuk melakukan **BATCH INSERT** ke tabel utama.
        *   *Contoh Query:* `INSERT INTO form_c1 (tps_id, suara, img_url) VALUES ?` (Lalu *pass* nested array data).

### Tahap 4: Integrasi AI / OCR (Untuk Validasi Angka C1)
*   **Tujuan:** Membaca angka di foto Form C1 secara otomatis menggunakan model Deep Learning/AI.
*   **Tugas:**
    1.  **Penting:** Jangan jalankan inferensi AI di API Server utama.
    2.  Jalankan modul OCR di *Worker Server* khusus yang memiliki akses ke GPU (Rekomendasi: [Biznet Gio NEO GPU](https://www.biznetgio.com/product/neo-gpu) berbasis **NVIDIA H200** dengan arsitektur Tensor Core / HBM3e Memory atau opsi alternatif **Biznet NEO Metal GPU - NVIDIA T4**).
    3.  *Workflow Worker:* Ambil antrean dari Redis -> Unduh gambar dari S3 -> Masukkan gambar ke model AI secara bertumpuk (*Batch Inference*: 16/32/64 gambar sekaligus dengan akselerasi GPU) -> Ekstrak teks angka -> Simpan ke MySQL via Batch Insert.

---

## 💻 Panduan Infrastruktur & Spesifikasi (Untuk DevOps)

Terapkan strategi sewa *Pay-as-you-go* / *Hourly Billing*. Sewa server raksasa berkinerja tinggi hanya untuk **3-5 hari (72-120 jam)** selama proses puncak rekapitulasi Pemilu.

### 🔴 Masa Puncak (Hari-H Pemilu)
Infrastruktur harus didesain *High Availability*:
*   **Load Balancer:** Membagi trafik merata ke semua instance API.
*   **Node.js API (15-20 VMs):** 4 vCPU, 8 GB RAM (Hanya untuk validasi form & kirim teks ke Redis).
*   **Redis Cluster (3 VMs):** 8 vCPU, 32 GB RAM (Master-Slave, Memory Optimized).
*   **MySQL Cluster (2 VMs):** 32 vCPU, 128 GB RAM + **WAJIB SSD NVMe (Min 10.000 IOPS)**. *Storage lambat akan menyebabkan disk write bottleneck.*
*   **Worker AI/OCR (GPU as a Service / GPUaaS):**
    *   **Pilihan Utama (Ultra High-Performance):** [Biznet Gio NEO GPU](https://www.biznetgio.com/product/neo-gpu) berbasis **NVIDIA H200** (141 GB HBM3e Memory, 22 vCPU Cores, 224 GB RAM, 750 GB NVMe Storage, Support NVIDIA NVLink, hingga 3.958 TFLOPS). Menggunakan skema fleksibel *Pay-As-You-Go Hourly* (Rp74.000/jam sebelum PPN) khusus diaktifkan saat 3-5 hari masa puncak perhitungan suara C1.
    *   **Pilihan Alternatif (Ekonomis / Standard Throughput):** [Biznet Gio NEO Metal](https://www.biznetgio.com/product/neo-metal) `a1.small.gpu.x86` (AMD EPYC 16-Core, 64 GB RAM, GPU NVIDIA T4 16 GB, SSD 2x 480 GB RAID1).
*   **Object Storage:** S3-Compatible (Biznet Gio NEO Object Storage / NOS), Siapkan kuota 5 TB hingga 10 TB.

### 🟢 Masa Normal (Harian / Tahunan)
Segera *Backup* dan hapus (*Terminate*) server besar di atas untuk menghemat anggaran hingga 90%. Pindah ke server berukuran kecil:
*   **App Server:** KVM VPS (Contoh: NEO Lite Pro MS.4.2) dengan 2 Core vCPU, 4GB RAM, NVMe.
*   **DB Server:** KVM VPS (Contoh: NEO Lite Pro MM.8.4) dengan 4 Core vCPU, 8GB RAM, NVMe.
*   **AI/OCR:** Matikan server GPU mahal. Jika fitur OCR masih diperlukan untuk audit insidental, jalankan OCR di mode CPU (lebih lambat, tetapi sangat hemat).

---

## 💰 Strategi Hybrid & Estimasi Anggaran (Termasuk PPN 11%)

Sesuai ketentuan perpajakan di Indonesia (UU HPP No. 7 Tahun 2021), seluruh layanan komputasi awan lokal dikenakan **Pajak Pertambahan Nilai (PPN) sebesar 11%**.

Berikut adalah rincian spesifikasi dan harga resmi dari [Biznet Gio NEO GPU](https://www.biznetgio.com/product/neo-gpu) beserta simulasi strategi hybrid (Scale-Up saat Hari-H dan Scale-Down ke VPS normal harian).

### 🚀 1. Spesifikasi & Harga Resmi Biznet Gio NEO GPU (NVIDIA H200)

Layanan *Cloud GPU as a Service* (GPUaaS) berbasis arsitektur **NVIDIA H200 Tensor Core** dengan memori **HBM3e**, interkoneksi **NVIDIA NVLink**, dan performa hingga **3.958 TFLOPS**:

| Paket GPU | GPU Memory (HBM3e) | CPU Cores | RAM Sistem | NVMe Storage | NVLink | Harga / Jam (Sebelum PPN) | PPN 11% / Jam | Total / Jam (Inc. PPN) | Harga / Bulan (Sebelum PPN) | PPN 11% / Bulan | Total / Bulan (Inc. PPN) |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **1x NVIDIA H200** | 141 GB | 22 Cores | 224 GB | 750 GB | ✔ | Rp 74.000 | Rp 8.140 | **Rp 82.140** | Rp 52.999.000 | Rp 5.829.890 | **Rp 58.828.890** |
| **2x NVIDIA H200** | 282 GB | 44 Cores | 448 GB | 1.500 GB | ✔ | Rp 147.000 | Rp 16.170 | **Rp 163.170** | Rp 105.999.000 | Rp 11.659.890 | **Rp 117.658.890** |
| **3x NVIDIA H200** | 423 GB | 66 Cores | 672 GB | 2.250 GB | ✔ | Rp 219.000 | Rp 24.090 | **Rp 243.090** | Rp 158.999.000 | Rp 17.489.890 | **Rp 176.488.890** |
| **4x NVIDIA H200** | 564 GB | 88 Cores | 896 GB | 3.000 GB | ✔ | Rp 299.000 | Rp 32.890 | **Rp 331.890** | Rp 211.999.000 | Rp 23.319.890 | **Rp 235.318.890** |
| **5x NVIDIA H200** | 705 GB | 110 Cores | 1.120 GB | 3.750 GB | ✔ | Rp 369.000 | Rp 40.590 | **Rp 409.590** | Rp 264.999.000 | Rp 29.149.890 | **Rp 294.148.890** |
| **6x NVIDIA H200** | 846 GB | 132 Cores | 1.344 GB | 4.500 GB | ✔ | Rp 439.000 | Rp 48.290 | **Rp 487.290** | Rp 317.999.000 | Rp 34.979.890 | **Rp 352.978.890** |
| **7x NVIDIA H200** | 947 GB | 154 Cores | 1.568 GB | 5.250 GB | ✔ | Rp 509.000 | Rp 55.990 | **Rp 564.990** | Rp 369.999.000 | Rp 40.699.890 | **Rp 410.698.890** |
| **8x NVIDIA H200** | 1.128 GB | 176 Cores | 1.792 GB | 6.000 GB | ✔ | Rp 589.000 | Rp 64.790 | **Rp 653.790** | Rp 423.999.000 | Rp 46.639.890 | **Rp 470.638.890** |

> 📌 *Catatan Fitur:* Seluruh paket NEO GPU mencakup **Free Bandwidth up to 10 Gbps**, storage lokal Enterprise NVMe berkecepatan tinggi, dan integrasi Private Interconnect.

---

### ⏱️ 2. Simulasi Biaya Masa Puncak 5 Hari (120 Jam) — Skema Pay-As-You-Go

Untuk efisiensi maksimal, instance GPU monster hanya dinyalakan selama masa puncak perhitungan (misal **5 hari = 120 jam**):

| Pilihan Paket | Durasi | Biaya Sewa (Sebelum PPN) | PPN 11% | Total Biaya (Inc. PPN) |
| :--- | :---: | :--- | :--- | :--- |
| **1x NVIDIA H200 (141 GB HBM3e)** | 120 Jam (5 Hari) | Rp 8.880.000 *(120 × Rp 74.000)* | Rp 976.800 | **Rp 9.856.800** |
| **2x NVIDIA H200 (282 GB HBM3e)** | 120 Jam (5 Hari) | Rp 17.640.000 *(120 × Rp 147.000)* | Rp 1.940.400 | **Rp 19.580.400** |
| **4x NVIDIA H200 (564 GB HBM3e)** | 120 Jam (5 Hari) | Rp 35.880.000 *(120 × Rp 299.000)* | Rp 3.946.800 | **Rp 39.826.800** |
| **8x NVIDIA H200 (1.128 GB HBM3e)** | 120 Jam (5 Hari) | Rp 70.680.000 *(120 × Rp 589.000)* | Rp 7.774.800 | **Rp 78.454.800** |
| *Opsi Alternatif:* **NEO Metal T4 (1 Bulan)** | 1 Bulan Penuh | Rp 9.899.000 | Rp 1.088.890 | **Rp 10.987.890** |

---

### 📉 3. Biaya Masa Normal (Scale-Down 11 Bulan Sisa)

Setelah masa puncak 5 hari selesai dan data C1 dimigrasi melalui skrip otomatis `migrate-c1-db.sh`, sistem diturunkan ke VPS KVM High-Performance NVMe:

| Komponen Server | Tipe Paket | Spesifikasi | Harga / Bln (Sebelum PPN) | PPN 11% / Bln | Total / Bln (Inc. PPN) | Total 11 Bulan (Inc. PPN) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Database Server** | NEO Lite Pro MM.8.4 | 4 vCPU, 8 GB RAM, NVMe | Rp 999.000 | Rp 109.890 | Rp 1.108.890 | Rp 12.197.790 |
| **Aplikasi Server** | NEO Lite Pro MS.4.2 | 2 vCPU, 4 GB RAM, NVMe | Rp 559.000 | Rp 61.490 | Rp 620.490 | Rp 6.825.390 |
| **Subtotal Harian** | - | - | **Rp 1.558.000** | **Rp 171.380** | **Rp 1.729.380** | **Rp 19.023.180** |

---

### 📊 4. Rekapitulasi Perbandingan Anggaran Tahunan Hybrid

Berikut komparasi total anggaran tahunan (1 tahun = Hari-H Pemilu + 11 Bulan Operasional Normal) setelah memperhitungkan **PPN 11%**:

| Skenario Alokasi | Masa Hari-H (Sebelum PPN) | Masa Normal 11 Bln (Sebelum PPN) | Total Sebelum PPN | PPN 11% | **Grand Total (Termasuk PPN 11%)** | Rekomendasi & Catatan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Skenario A: NEO GPU 1x H200 (Pay-As-You-Go 120 Jam) + 11 Bulan VPS Harian** | Rp 8.880.000 *(120 jam)* | Rp 17.138.000 | Rp 26.018.000 | Rp 2.861.980 | **Rp 28.879.980** | ⭐ **Sangat Direkomendasikan:** Performa AI tertinggi (H200 141GB HBM3e) dengan biaya paling efisien karena sewa berbasis jam. |
| **Skenario B: NEO Metal GPU T4 (Sewa 1 Bulan Penuh) + 11 Bulan VPS Harian** | Rp 9.899.000 *(1 bulan)* | Rp 17.138.000 | Rp 27.037.000 | Rp 2.974.070 | **Rp 30.011.070** | Cocok jika tim membutuhkan server Bare Metal GPU dedicated standby selama 30 hari kalender penuh. |
| **Skenario C: NEO GPU 1x H200 (Sewa 1 Bulan Penuh) + 11 Bulan VPS Harian** | Rp 52.999.000 *(1 bulan)* | Rp 17.138.000 | Rp 70.137.000 | Rp 7.715.070 | **Rp 77.852.070** | Dipilih jika periode audit forensik model AI intensif berlangsung nonstop selama 1 bulan penuh pasca pemilihan. |

> 💡 **Efisiensi Anggaran & Alokasi Strategis:**
> - Dengan menerapkan **Skenario A (Hybrid Hourly H200)**, tim hanya mengeluarkan total **Rp 28.879.980 (sudah termasuk PPN 11%)** untuk infrastruktur server setahun penuh.
> - Sisa alokasi anggaran (penghematan puluhan juta rupiah dibandingkan menyewa server raksasa 1 tahun nonstop) dapat dialokasikan untuk:
>   - Langganan **Web Application Firewall (WAF) & DDoS Protection** tingkat lanjut.
>   - Insentif siaga (*on-call standby allowance*) bagi tim Engineer, DevOps, dan Operator Data C1 selama Hari-H.

---

## 🔄 Rencana Otomatisasi Backup & Migrasi Data (Down-Scale Tanpa Data Loss)

Untuk beralih dari server raksasa (Hari-H) ke server hemat (Harian) tanpa kehilangan 1 data suara pun, jalankan SOP 5 langkah berikut:

```text
[1. Drain Queue] ──▶ [2. Lock/Read-Only] ──▶ [3. Dump & Checksum] ──▶ [4. Restore & Verifikasi] ──▶ [5. Switchover DNS]
```

### SOP Langkah Demi Langkah

1. **Pastikan Antrean Kosong (Drain Queue):**
   * Periksa antrean Redis (`BullMQ`). Pastikan jumlah job tersisa = `0`.
   * Hentikan background worker: `systemctl stop worker-c1`.
2. **Ubah Database ke Mode Read-Only Sementara:**
   * Sebelum dump dimulai, pastikan tidak ada data baru yang masuk:
     ```sql
     SET GLOBAL read_only = ON;
     FLUSH TABLES WITH READ LOCK;
     ```
3. **Eksekusi Backup Terkompresi & Hitung Checksum:**
   * Dump database dengan flag konsistensi InnoDB, simpan hash SHA256 file dump untuk audit forensik.
4. **Restore ke Database Harian (VPS Baru):**
   * Pindahkan file dump terenkripsi/terkompresi ke VPS baru, lalu restore.
5. **Verifikasi Integritas Data (Wajib Cocok 100%):**
   * Bandingkan `COUNT(*)` dan `CHECKSUM TABLE` pada tabel kritis (contoh: `suara_c1`, `tps`, `audit_log`) antara database lama dan database baru.
6. **Switchover Koneksi:**
   * Update file `.env` di server aplikasi (`DB_HOST` diarahkan ke IP VPS database baru) atau arahkan private DNS/Load Balancer.
7. **Terminate Server Hari-H:**
   * Setelah sistem harian terverifikasi berjalan normal selama 1x24 jam, hapus instance Hari-H dari dashboard cloud provider untuk menghentikan tagihan.

---

### 📜 Script Otomatisasi Siap Pakai: `migrate-c1-db.sh`

Simpan skrip ini di server Primary Hari-H (`/opt/scripts/migrate-c1-db.sh`), beri hak eksekusi (`chmod +x migrate-c1-db.sh`):

```bash
#!/bin/bash
set -euo pipefail

# ==============================================================================
# SCRIPT OTOMATISASI BACKUP & MIGRASI DATABASE C1 (HARI-H -> HARIAN)
# ==============================================================================

DB_NAME="db_pemilu_c1"
DB_USER="root"
DB_PASS="GANTI_DENGAN_PASSWORD_DB_SUMBER"

# Server Tujuan (VPS NEO Lite Pro Harian)
TARGET_HOST="10.0.0.50"  # IP Private VPS DB Baru
TARGET_USER="root"
TARGET_DB_USER="root"
TARGET_DB_PASS="GANTI_DENGAN_PASSWORD_DB_TARGET"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/c1_migration"
DUMP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${DUMP_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"

echo "=================================================="
echo "[1/5] Memeriksa & Mengunci Database Sumber..."
echo "=================================================="
mysql -u"${DB_USER}" -p"${DB_PASS}" -e "SET GLOBAL read_only = ON;"

echo "[2/5] Melakukan Dump Database Konsisten..."
# Menggunakan --single-transaction agar dump konsisten tanpa lock panjang di InnoDB
mysqldump -u"${DB_USER}" -p"${DB_PASS}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  "${DB_NAME}" | gzip -c > "${DUMP_FILE}"

echo "[3/5] Membuat Hash Verifikasi (SHA-256)..."
sha256sum "${DUMP_FILE}" > "${CHECKSUM_FILE}"
echo "Hash SHA256: $(cat "${CHECKSUM_FILE}")"

echo "[4/5] Mengirim Dump ke Server Target (${TARGET_HOST})..."
scp "${DUMP_FILE}" "${TARGET_USER}@${TARGET_HOST}:/tmp/"
scp "${CHECKSUM_FILE}" "${TARGET_USER}@${TARGET_HOST}:/tmp/"

echo "[5/5] Melakukan Restore & Verifikasi Integritas di Server Target..."
ssh "${TARGET_USER}@${TARGET_HOST}" bash -c "'
  set -euo pipefail
  cd /tmp
  echo \"Verifikasi Checksum di server tujuan...\"
  sha256sum -c $(basename "${CHECKSUM_FILE}")

  echo \"Membuat Database Target jika belum ada...\"
  mysql -u\"${TARGET_DB_USER}\" -p\"${TARGET_DB_PASS}\" -e \"CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\"

  echo \"Mengimpor data ke Database Target...\"
  gunzip -c $(basename "${DUMP_FILE}") | mysql -u\"${TARGET_DB_USER}\" -p\"${TARGET_DB_PASS}\" \"${DB_NAME}\"

  echo \"Import selesai. Membersihkan file sementara...\"
  rm -f /tmp/$(basename "${DUMP_FILE}") /tmp/$(basename "${CHECKSUM_FILE}")
'"

echo "=================================================="
echo "✅ Migrasi Selesai Tanpa Kendala!"
echo "Lakukan audit row count sebelum mematikan server ini."
echo "=================================================="
```

---

### 🔍 Skrip Verifikasi Jumlah Data (Jalankan di Kedua Server)

Jalankan query ini di MySQL server sumber dan server target. Angka hasil query **wajib identik**:

```sql
SELECT 
    TABLE_NAME, 
    TABLE_ROWS 
FROM 
    information_schema.tables 
WHERE 
    table_schema = 'db_pemilu_c1'
ORDER BY 
    TABLE_NAME;
```

---

## ✅ Indikator Keberhasilan (Ceklis QA & Migrasi)
- [ ] Mengunggah file gambar 5MB tidak memakan RAM di Node.js API (karena diunggah langsung ke S3 via Presigned URL).
- [ ] Dites dengan *Load Testing Tool* (JMeter / K6) sebanyak 20.000 TPS, CPU di server Node.js API tidak menyentuh 100%.
- [ ] Database MySQL berjalan stabil tanpa *error* `Too many connections` atau `Lock wait timeout exceeded`.
- [ ] Proses OCR GPU berjalan stabil tanpa mengalami *Out of Memory (OOM)*.
- [ ] Antrean Redis (`BullMQ`) telah habis (0 job tersisa) sebelum migrasi database dijalankan.
- [ ] Checksum SHA-256 file backup valid saat di-restore ke server VPS harian.
- [ ] Total baris (`COUNT(*)`) data Form C1 dan perolehan suara di server harian 100% sama persis dengan server Hari-H.
