-- ============================================================================
-- db_pemilu_c1 - Skema Database Dinamis Multi-Pemilihan (Issue #1)
-- Optimasi High-Throughput: write-heavy 29.000 TPS
-- Aturan: TIDAK menggunakan Foreign Key CASCADE, TIDAK ada Full-text index,
--         INI minimal namun efektif untuk INSERT massal.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS db_pemilu_c1
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE db_pemilu_c1;

-- ----------------------------------------------------------------------------
-- Master TPS (29.000 TPS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_tps (
  id            VARCHAR(24)  NOT NULL COMMENT 'Kode TPS ternormalisasi (misal: 3273011001001)',
  provinsi      VARCHAR(64)  NOT NULL,
  kota          VARCHAR(64)  NOT NULL,
  kecamatan     VARCHAR(64)  NOT NULL,
  kelurahan     VARCHAR(64)  NOT NULL,
  no_tps        VARCHAR(8)   NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Master Tempat Pemungutan Suara';

-- ----------------------------------------------------------------------------
-- Kategori Pemilihan (Pilgub, Pilbup, Pileg, DPD)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kategori_pemilihan (
  id             VARCHAR(32)  NOT NULL COMMENT 'Kode pemilihan (misal: PILKADA_KOTA_BDG)',
  nama_pemilihan VARCHAR(128) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Kategori pemilihan (multi-pemilihan dinamis)';

-- ----------------------------------------------------------------------------
-- Master Kandidat (PASLON / PARTAI / CALEG / DPD) - generik multi-pemilihan
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_kandidat (
  id                     VARCHAR(64)                      NOT NULL COMMENT 'Kode kandidat (PASLON_1, PARTAI_X, CALEG_Y, DPD_Z)',
  kategori_pemilihan_id  VARCHAR(32)                      NOT NULL,
  tipe_kandidat          ENUM('PASLON','PARTAI','CALEG','DPD') NOT NULL,
  nama                   VARCHAR(128)                     NOT NULL,
  no_urut                SMALLINT UNSIGNED                NOT NULL,
  PRIMARY KEY (id),
  KEY idx_kandidat_kategori (kategori_pemilihan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Master kandidat/partai/caleg per kategori pemilihan';

-- ----------------------------------------------------------------------------
-- Transaksi Form C1 (tabel utama write-heavy)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaksi_c1 (
  id                       VARCHAR(36)    NOT NULL COMMENT 'UUID v4',
  tps_id                   VARCHAR(24)    NOT NULL,
  kategori_pemilihan_id    VARCHAR(32)    NOT NULL,
  total_suara_sah          INT UNSIGNED   NOT NULL DEFAULT 0,
  total_suara_tidak_sah    INT UNSIGNED   NOT NULL DEFAULT 0,
  image_url                VARCHAR(512)   NOT NULL,
  status_ocr               TINYINT        NOT NULL DEFAULT 0 COMMENT '0=pending, 1=ok, 2=failed',
  created_at               DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_c1_tps (tps_id),
  KEY idx_c1_kategori_created (kategori_pemilihan_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Transaksi rekapitulasi Form C1';

-- ----------------------------------------------------------------------------
-- Detail Suara per Kandidat (dihubungkan ke master_kandidat secara generik)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detail_suara (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaksi_c1_id   VARCHAR(36)     NOT NULL,
  kandidat_id       VARCHAR(64)     NOT NULL,
  jumlah_suara      INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_detail_transaksi (transaksi_c1_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Detail perolehan suara per kandidat';

-- ============================================================================
-- Seed Data Referensi (untuk pengujian lokal / prototype)
-- ============================================================================
INSERT INTO kategori_pemilihan (id, nama_pemilihan) VALUES
  ('PILKADA_KOTA_BDG', 'Pilkada Kota Bandung 2026')
ON DUPLICATE KEY UPDATE nama_pemilihan = VALUES(nama_pemilihan);

INSERT INTO master_kandidat (id, kategori_pemilihan_id, tipe_kandidat, nama, no_urut) VALUES
  ('PASLON_1', 'PILKADA_KOTA_BDG', 'PASLON', 'Calon Gubernur Pilkada - Paslon 1', 1),
  ('PASLON_2', 'PILKADA_KOTA_BDG', 'PASLON', 'Calon Gubernur Pilkada - Paslon 2', 2)
ON DUPLICATE KEY UPDATE nama = VALUES(nama);

INSERT INTO master_tps (id, provinsi, kota, kecamatan, kelurahan, no_tps) VALUES
  ('3273011001001', 'Jawa Barat', 'Kota Bandung', 'Kec. Coblong', 'Kel. Dago', '001')
ON DUPLICATE KEY UPDATE no_tps = VALUES(no_tps);