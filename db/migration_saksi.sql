-- ============================================================================
-- Tabel Saksi: pendaftar saksi TPS (1 TPS idealnya 1+ saksi).
-- Aturan: NIK 16 digit & unik (syarat KPU: saksi terdaftar sebagai pemilih),
-- 1 NIK hanya di 1 TPS. Tanpa FK CASCADE (aturan Issue #1).
-- ============================================================================

USE db_pemilu_c1;

CREATE TABLE IF NOT EXISTS saksi (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama       VARCHAR(128) NOT NULL,
  nik        VARCHAR(16)  NOT NULL COMMENT '16 digit, unik',
  no_hp      VARCHAR(16)  NULL COMMENT 'format 08xx',
  tps_id     VARCHAR(24)  NOT NULL COMMENT 'ref master_tps.id',
  keterangan VARCHAR(256) NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_saksi_nik (nik),
  KEY idx_saksi_tps (tps_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registrasi saksi TPS';
