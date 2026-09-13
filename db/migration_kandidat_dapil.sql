-- ============================================================================
-- Migrasi Kandidat: tautan dapil (opsional; wajib diisi untuk pileg).
-- Tanpa Foreign Key CASCADE (aturan Issue #1), relasi dijaga aplikasi.
-- ============================================================================

USE db_pemilu_c1;

ALTER TABLE master_kandidat
  ADD COLUMN dapil_id VARCHAR(24) NULL COMMENT 'ref dapil.id (opsional, wajib untuk pileg)' AFTER kategori_pemilihan_id,
  ADD KEY idx_kandidat_dapil (dapil_id);
