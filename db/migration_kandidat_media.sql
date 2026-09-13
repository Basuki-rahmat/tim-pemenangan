-- ============================================================================
-- Migrasi Kandidat: tambah foto & nama partai (untuk form registrasi admin)
-- Foto disimpan sebagai URL object storage (hasil Presigned URL S3/MinIO).
-- MySQL 8.0 tidak mendukung ADD COLUMN IF NOT EXISTS, jadi cek dulu:
--   SHOW COLUMNS FROM master_kandidat LIKE 'foto';
-- ============================================================================

USE db_pemilu_c1;

ALTER TABLE master_kandidat
  ADD COLUMN foto VARCHAR(512) NULL COMMENT 'URL foto kandidat' AFTER nama,
  ADD COLUMN partai VARCHAR(128) NULL COMMENT 'Nama partai pengusung/pendukung' AFTER foto,
  ADD KEY idx_kandidat_partai (partai);
