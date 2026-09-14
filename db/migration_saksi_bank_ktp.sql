-- ============================================================================
-- Migrasi Saksi: tambah foto KTP, bank dan no rekening (untuk honor)
-- ============================================================================

USE db_pemilu_c1;

ALTER TABLE saksi
  ADD COLUMN foto_ktp VARCHAR(512) NULL COMMENT 'URL foto KTP (object storage)' AFTER keterangan,
  ADD COLUMN bank VARCHAR(32) NULL COMMENT 'Nama bank / e-wallet (BCA, BRI, BNI, Mandiri, BSI, CIMB, Danamon, Permata, BTN, BTPN, SeaBank, Jago, Dana, OVO, Gopay, ShopeePay, LinkAja, Lainnya)' AFTER foto_ktp,
  ADD COLUMN no_rekening VARCHAR(64) NULL COMMENT 'No rekening / no e-wallet' AFTER bank,
  ADD KEY idx_saksi_bank (bank);
