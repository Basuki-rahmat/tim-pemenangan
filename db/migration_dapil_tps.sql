-- ============================================================================
-- Migrasi Dapil & Master TPS sesuai aturan KPU (PKPU No. 6/2023, 271/2018)
-- Aturan Issue #1: tanpa Foreign Key CASCADE (relasi dijaga aplikasi).
--
-- A. Tabel dapil: 1 baris per daerah pemilihan
--    tingkat: DPR_RI | DPD | DPRD_PROV | DPRD_KABKOTA
-- B. dapil_kabupaten : komposisi DPR RI & DPRD Provinsi (per kabupaten/kota)
-- C. dapil_kecamatan : komposisi DPRD Kab/Kota (per kecamatan)
-- D. master_tps : taut desa_id + jumlah_pemilih (maks 500/TPS, PKPU) +
--    unik per (desa, no_tps)
-- ============================================================================

USE db_pemilu_c1;

-- ----------------------------------------------------------------------------
-- A. Master Dapil
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dapil (
  id           VARCHAR(24) NOT NULL COMMENT 'DPRRI-LPG1, DPD-LPG, DPRDPROV-LPG3, DPRDKAB-1801-2',
  tingkat      ENUM('DPR_RI','DPD','DPRD_PROV','DPRD_KABKOTA') NOT NULL,
  kode         VARCHAR(16) NOT NULL COMMENT 'LPG-1, 1801-2',
  nama         VARCHAR(128) NOT NULL COMMENT 'Dapil Lampung I (DPR RI)',
  provinsi_id  INT NOT NULL DEFAULT 18 COMMENT '18 = Lampung',
  kabupaten_id INT NULL COMMENT 'diisi khusus DPRD_KABKOTA',
  jml_kursi    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_dapil_tingkat (tingkat),
  KEY idx_dapil_kab (kabupaten_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Daerah pemilihan (PKPU 6/2023)';

-- ----------------------------------------------------------------------------
-- B. Komposisi kab/kota per dapil (DPR RI & DPRD Provinsi)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dapil_kabupaten (
  dapil_id     VARCHAR(24) NOT NULL,
  kabupaten_id INT NOT NULL,
  PRIMARY KEY (dapil_id, kabupaten_id),
  KEY idx_dk_kab (kabupaten_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Kab/kota anggota dapil DPR RI / DPRD Provinsi';

-- ----------------------------------------------------------------------------
-- C. Komposisi kecamatan per dapil (DPRD Kab/Kota)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dapil_kecamatan (
  dapil_id     VARCHAR(24) NOT NULL,
  kecamatan_id INT NOT NULL,
  PRIMARY KEY (dapil_id, kecamatan_id),
  KEY idx_dc_kec (kecamatan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Kecamatan anggota dapil DPRD Kab/Kota';

-- ----------------------------------------------------------------------------
-- D. Upgrade master_tps (KPU: 1 TPS = 1 desa/kelurahan, maks 500 pemilih)
-- ----------------------------------------------------------------------------
ALTER TABLE master_tps
  ADD COLUMN desa_id INT NULL COMMENT 'ref desa.id (NULL = data lama)' AFTER id,
  ADD COLUMN jumlah_pemilih INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'DPT per TPS, maks 500 (PKPU)' AFTER no_tps,
  ADD KEY idx_tps_desa (desa_id),
  ADD CONSTRAINT chk_tps_pemilih CHECK (jumlah_pemilih <= 500),
  ADD UNIQUE KEY uq_tps_desa_no (desa_id, no_tps);
