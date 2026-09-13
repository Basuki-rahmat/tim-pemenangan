-- ============================================================================
-- Login Saksi: username unik + hash password (scrypt, format sama admin).
-- Password asli TIDAK disimpan; hanya ditampilkan sekali saat dibuat/direset.
-- ============================================================================

USE db_pemilu_c1;

ALTER TABLE saksi
  ADD COLUMN username VARCHAR(32) NULL COMMENT 'unik, untuk login saksi' AFTER nik,
  ADD COLUMN password_hash VARCHAR(256) NULL COMMENT 'format: scrypt$salt$hash' AFTER username,
  ADD UNIQUE KEY uq_saksi_username (username);
