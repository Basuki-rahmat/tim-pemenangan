-- Tambah surat suara & multi gambar C1
USE db_pemilu_c1;
ALTER TABLE transaksi_c1
  ADD COLUMN jumlah_surat_suara INT UNSIGNED NULL COMMENT 'total surat diterima' AFTER jumlah_hadir,
  ADD COLUMN surat_baik INT UNSIGNED NULL COMMENT 'surat baik' AFTER jumlah_surat_suara,
  ADD COLUMN surat_rusak INT UNSIGNED NULL COMMENT 'surat rusak' AFTER surat_baik,
  ADD COLUMN surat_cadangan INT UNSIGNED NULL COMMENT 'surat cadangan' AFTER surat_rusak,
  ADD COLUMN image_urls TEXT NULL COMMENT 'JSON array url multi gambar C1' AFTER image_url;
