-- Perketat absensi: wajib foto dari kamera + GPS sesuai TPS
USE db_pemilu_c1;
ALTER TABLE saksi_absensi
  ADD COLUMN lat DOUBLE NULL COMMENT 'lat foto absensi (wajib)' AFTER foto_bukti,
  ADD COLUMN lng DOUBLE NULL COMMENT 'lng foto absensi' AFTER lat,
  ADD COLUMN jarak_meter INT UNSIGNED NULL COMMENT 'jarak ke TPS meter' AFTER lng,
  ADD COLUMN is_gps_valid TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=sesuai radius TPS';
