-- Tambah kolom DPT & hadir untuk rekap C1 presisi
USE db_pemilu_c1;
ALTER TABLE transaksi_c1
  ADD COLUMN jumlah_dpt INT UNSIGNED NULL COMMENT 'DPT TPS saat rekap' AFTER kategori_pemilihan_id,
  ADD COLUMN jumlah_hadir INT UNSIGNED NULL COMMENT 'Pemilih hadir (<= DPT)' AFTER jumlah_dpt,
  ADD KEY idx_c1_dpt (jumlah_dpt);
