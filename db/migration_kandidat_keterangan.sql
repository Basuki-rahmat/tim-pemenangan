-- ============================================================================
-- Migrasi Kandidat: tambah keterangan / detail (untuk modal popup detail)
-- ============================================================================
USE db_pemilu_c1;

-- Tambah kolom keterangan jika belum ada (cek manual: SHOW COLUMNS FROM master_kandidat LIKE 'keterangan')
ALTER TABLE master_kandidat
  ADD COLUMN keterangan TEXT NULL COMMENT 'Keterangan / deskripsi kandidat (untuk modal detail)' AFTER partai;
