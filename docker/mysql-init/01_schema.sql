/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_sessions` (
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'hex 32 byte',
  `user_id` int unsigned NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`token`),
  KEY `idx_session_user` (`user_id`),
  KEY `idx_session_exp` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Token sesi login admin (kedaluwarsa otomatis dicek aplikasi)';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'format: scrypt$salt_hex$hash_hex',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Akun admin pengelola data wilayah';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dapil` (
  `id` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'DPRRI-LPG1, DPD-LPG, DPRDPROV-LPG3, DPRDKAB-1801-2',
  `tingkat` enum('DPR_RI','DPD','DPRD_PROV','DPRD_KABKOTA') COLLATE utf8mb4_unicode_ci NOT NULL,
  `kode` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'LPG-1, 1801-2',
  `nama` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Dapil Lampung I (DPR RI)',
  `provinsi_id` int NOT NULL DEFAULT '18' COMMENT '18 = Lampung',
  `kabupaten_id` int DEFAULT NULL COMMENT 'diisi khusus DPRD_KABKOTA',
  `jml_kursi` smallint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_dapil_tingkat` (`tingkat`),
  KEY `idx_dapil_kab` (`kabupaten_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Daerah pemilihan (PKPU 6/2023)';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dapil_kabupaten` (
  `dapil_id` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kabupaten_id` int NOT NULL,
  PRIMARY KEY (`dapil_id`,`kabupaten_id`),
  KEY `idx_dk_kab` (`kabupaten_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kab/kota anggota dapil DPR RI / DPRD Provinsi';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dapil_kecamatan` (
  `dapil_id` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kecamatan_id` int NOT NULL,
  PRIMARY KEY (`dapil_id`,`kecamatan_id`),
  KEY `idx_dc_kec` (`kecamatan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kecamatan anggota dapil DPRD Kab/Kota';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `desa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kecamatan_id` int DEFAULT NULL,
  `nama` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kode` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `kecamatan_id` (`kecamatan_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2657 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detail_suara` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `transaksi_c1_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kandidat_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jumlah_suara` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_detail_transaksi` (`transaksi_c1_id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Detail perolehan suara per kandidat';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `kabupaten` (
  `id` int NOT NULL AUTO_INCREMENT,
  `provinsi_id` int DEFAULT NULL,
  `nama` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kode` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `provinsi_id` (`provinsi_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1873 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `kategori_pemilihan` (
  `id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Kode pemilihan (misal: PILKADA_KOTA_BDG)',
  `nama_pemilihan` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kategori pemilihan (multi-pemilihan dinamis)';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `kecamatan` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kabupaten_id` int DEFAULT NULL,
  `nama` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kode` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `kabupaten_id` (`kabupaten_id`)
) ENGINE=InnoDB AUTO_INCREMENT=180816 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `master_kandidat` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Kode kandidat (PASLON_1, PARTAI_X, CALEG_Y, DPD_Z)',
  `kategori_pemilihan_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dapil_id` varchar(24) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ref dapil.id (opsional, wajib untuk pileg)',
  `tipe_kandidat` enum('PASLON','PARTAI','CALEG','DPD') COLLATE utf8mb4_unicode_ci NOT NULL,
  `nama` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `foto` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'URL foto kandidat',
  `partai` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Nama partai pengusung/pendukung',
  `keterangan` text COLLATE utf8mb4_unicode_ci COMMENT 'Keterangan / deskripsi kandidat',
  `no_urut` smallint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kandidat_kategori` (`kategori_pemilihan_id`),
  KEY `idx_kandidat_partai` (`partai`),
  KEY `idx_kandidat_dapil` (`dapil_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Master kandidat/partai/caleg per kategori pemilihan';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `master_tps` (
  `id` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Kode TPS ternormalisasi (misal: 3273011001001)',
  `desa_id` int DEFAULT NULL COMMENT 'ref desa.id (NULL = data lama)',
  `provinsi` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kota` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kecamatan` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kelurahan` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `no_tps` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jumlah_pemilih` int unsigned NOT NULL DEFAULT '0' COMMENT 'DPT per TPS, maks 500 (PKPU)',
  `lat` decimal(10,8) DEFAULT NULL COMMENT 'latitude GPS',
  `lng` decimal(11,8) DEFAULT NULL COMMENT 'longitude GPS',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tps_desa_no` (`desa_id`,`no_tps`),
  KEY `idx_tps_desa` (`desa_id`),
  CONSTRAINT `chk_tps_pemilih` CHECK ((`jumlah_pemilih` <= 500))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Master Tempat Pemungutan Suara';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `provinsi` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=97 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saksi` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nama` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nik` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '16 digit, unik',
  `username` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'unik, untuk login saksi',
  `password_hash` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'format: scrypt$salt$hash',
  `no_hp` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'format 08xx',
  `tps_id` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ref master_tps.id',
  `kandidat_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ref master_kandidat.id (penugasan)',
  `keterangan` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_ktp` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'URL foto KTP',
  `bank` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'bank',
  `no_rekening` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'no rekening',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_saksi_nik` (`nik`),
  UNIQUE KEY `uq_saksi_username` (`username`),
  KEY `idx_saksi_tps` (`tps_id`),
  KEY `idx_saksi_kandidat` (`kandidat_id`),
  KEY `idx_saksi_bank` (`bank`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Registrasi saksi TPS';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saksi_absensi` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `saksi_id` int unsigned NOT NULL COMMENT 'ref saksi.id',
  `tps_id` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'redundan dari saksi.tps_id untuk filter cepat',
  `tanggal` date NOT NULL COMMENT 'tgl absensi',
  `status` enum('HADIR','TIDAK','IZIN','SAKIT') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'HADIR',
  `jam_hadir` time DEFAULT NULL,
  `foto_bukti` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'URL foto bukti hadir',
  `lat` double DEFAULT NULL COMMENT 'lat foto absensi (wajib)',
  `lng` double DEFAULT NULL COMMENT 'lng foto absensi',
  `jarak_meter` int unsigned DEFAULT NULL COMMENT 'jarak ke TPS meter',
  `keterangan` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `is_gps_valid` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1=sesuai radius TPS',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_absensi_saksi_tgl` (`saksi_id`,`tanggal`),
  KEY `idx_absensi_tps` (`tps_id`),
  KEY `idx_absensi_tgl` (`tanggal`),
  KEY `idx_absensi_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Absensi kehadiran saksi';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saksi_dana` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `saksi_id` int unsigned NOT NULL COMMENT 'ref saksi.id',
  `tps_id` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nominal` int unsigned NOT NULL COMMENT 'IDR',
  `bank` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'BCA/BRI/.../DANA/OVO/GOPAY/SEABANK',
  `no_rekening` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','PROSES','CAIR','BATAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `tanggal_cair` date DEFAULT NULL,
  `bukti_tf` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'URL bukti transfer',
  `keterangan` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_dana_saksi` (`saksi_id`),
  KEY `idx_dana_tps` (`tps_id`),
  KEY `idx_dana_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dana honor saksi';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saksi_sessions` (
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'hex 32 byte',
  `saksi_id` int unsigned NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`token`),
  KEY `idx_saksi_sess_saksi` (`saksi_id`),
  KEY `idx_saksi_sess_exp` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaksi_c1` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'UUID v4',
  `tps_id` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kategori_pemilihan_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jumlah_dpt` int unsigned DEFAULT NULL COMMENT 'DPT TPS saat rekap',
  `jumlah_hadir` int unsigned DEFAULT NULL COMMENT 'Pemilih hadir (<= DPT)',
  `jumlah_surat_suara` int unsigned DEFAULT NULL COMMENT 'total surat diterima',
  `surat_baik` int unsigned DEFAULT NULL COMMENT 'surat baik',
  `surat_rusak` int unsigned DEFAULT NULL COMMENT 'surat rusak',
  `surat_cadangan` int unsigned DEFAULT NULL COMMENT 'surat cadangan',
  `total_suara_sah` int unsigned NOT NULL DEFAULT '0',
  `total_suara_tidak_sah` int unsigned NOT NULL DEFAULT '0',
  `image_url` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_urls` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON array url multi gambar C1',
  `status_ocr` tinyint NOT NULL DEFAULT '0' COMMENT '0=pending, 1=ok, 2=failed',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_c1_tps` (`tps_id`),
  KEY `idx_c1_kategori_created` (`kategori_pemilihan_id`,`created_at`),
  KEY `idx_c1_dpt` (`jumlah_dpt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Transaksi rekapitulasi Form C1';
/*!40101 SET character_set_client = @saved_cs_client */;
