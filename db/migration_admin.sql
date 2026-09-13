-- ============================================================================
-- Migrasi Admin Auth: login admin untuk memisahkan halaman publik & admin
-- Aturan Issue #1: tanpa Foreign Key CASCADE, indeks minimal.
-- Seed user via:  node src/create-admin.js <username> <password>
-- ============================================================================

USE db_pemilu_c1;

CREATE TABLE IF NOT EXISTS admin_users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(256) NOT NULL COMMENT 'format: scrypt$salt_hex$hash_hex',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Akun admin pengelola data wilayah';

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      VARCHAR(64)  NOT NULL COMMENT 'hex 32 byte',
  user_id    INT UNSIGNED NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token),
  KEY idx_session_user (user_id),
  KEY idx_session_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Token sesi login admin (kedaluwarsa otomatis dicek aplikasi)';
