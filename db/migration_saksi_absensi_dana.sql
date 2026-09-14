-- ============================================================================
-- Migrasi Absensi & Dana Saksi
--  - saksi_absensi: kehadiran saksi per tanggal (unik saksi+tg, foto bukti)
--  - saksi_dana: honor/operasional per saksi (nominal, bank, status cair)
-- ============================================================================

USE db_pemilu_c1;

-- Absensi
CREATE TABLE IF NOT EXISTS saksi_absensi (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  saksi_id    INT UNSIGNED NOT NULL COMMENT 'ref saksi.id',
  tps_id      VARCHAR(24)  NOT NULL COMMENT 'redundan dari saksi.tps_id untuk filter cepat',
  tanggal     DATE         NOT NULL COMMENT 'tgl absensi',
  status      ENUM('HADIR','TIDAK','IZIN','SAKIT') NOT NULL DEFAULT 'HADIR',
  jam_hadir   TIME         NULL,
  foto_bukti  VARCHAR(512) NULL COMMENT 'URL foto bukti hadir',
  keterangan  VARCHAR(256) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_absensi_saksi_tgl (saksi_id, tanggal),
  KEY idx_absensi_tps (tps_id),
  KEY idx_absensi_tgl (tanggal),
  KEY idx_absensi_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Absensi kehadiran saksi';

-- Dana / Honor
CREATE TABLE IF NOT EXISTS saksi_dana (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  saksi_id      INT UNSIGNED NOT NULL COMMENT 'ref saksi.id',
  tps_id        VARCHAR(24)  NOT NULL,
  nominal       INT UNSIGNED NOT NULL COMMENT 'IDR',
  bank          VARCHAR(32)  NULL COMMENT 'BCA/BRI/.../DANA/OVO/GOPAY/SEABANK',
  no_rekening   VARCHAR(64)  NULL,
  status        ENUM('PENDING','PROSES','CAIR','BATAL') NOT NULL DEFAULT 'PENDING',
  tanggal_cair  DATE         NULL,
  bukti_tf      VARCHAR(512) NULL COMMENT 'URL bukti transfer',
  keterangan    VARCHAR(256) NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_dana_saksi (saksi_id),
  KEY idx_dana_tps (tps_id),
  KEY idx_dana_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Dana honor saksi';
