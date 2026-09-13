-- ============================================================================
-- Saksi ditugaskan untuk kandidat tertentu (mis. saksi paslon/caleg).
-- Tanpa FK CASCADE (aturan Issue #1), relasi dijaga aplikasi.
-- ============================================================================

USE db_pemilu_c1;

ALTER TABLE saksi
  ADD COLUMN kandidat_id VARCHAR(64) NULL COMMENT 'ref master_kandidat.id (penugasan)' AFTER tps_id,
  ADD KEY idx_saksi_kandidat (kandidat_id);
