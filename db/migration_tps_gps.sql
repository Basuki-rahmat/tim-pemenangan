-- ============================================================================
-- Migrasi TPS: kolom koordinat GPS (diisi admin/saksi belakangan, NULL).
-- ============================================================================

USE db_pemilu_c1;

ALTER TABLE master_tps
  ADD COLUMN lat DECIMAL(10, 8) NULL COMMENT 'latitude GPS' AFTER jumlah_pemilih,
  ADD COLUMN lng DECIMAL(11, 8) NULL COMMENT 'longitude GPS' AFTER lat;
