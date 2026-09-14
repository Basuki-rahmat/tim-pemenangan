-- Saksi sessions untuk login saksi mandiri (terpisah dari admin)
USE db_pemilu_c1;
CREATE TABLE IF NOT EXISTS saksi_sessions (
  token VARCHAR(64) NOT NULL COMMENT 'hex 32 byte',
  saksi_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token),
  KEY idx_saksi_sess_saksi (saksi_id),
  KEY idx_saksi_sess_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
