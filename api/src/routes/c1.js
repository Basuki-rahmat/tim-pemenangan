const { Router } = require('express');
const { createPresignedUpload } = require('../s3');
const { c1Queue } = require('../queue');

const router = Router();
const JOB_NAME = 'process-c1';

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-producer', ts: new Date().toISOString() });
});

router.get('/upload-request', async (req, res) => {
  const t0 = Date.now();
  try {
    const request = await createPresignedUpload({
      filename: req.query.filename || 'c1.jpg',
      contentType: req.query.content_type || 'image/jpeg'
    });
    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      ...request
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/submit', async (req, res) => {
  const t0 = Date.now();
  const body = req.body || {};

  const {
    tps_id,
    kategori_pemilihan_id,
    image_key,
    image_keys,
    suara_sah,
    suara_tidak_sah,
    detail_suara,
    jumlah_dpt,
    jumlah_hadir,
    jumlah_surat_suara,
    surat_baik,
    surat_rusak,
    surat_cadangan
  } = body;

  // dukung multi gambar: image_keys array atau single image_key
  let keys = [];
  if (Array.isArray(image_keys) && image_keys.length) keys = image_keys.filter(Boolean).map(s=>String(s).trim()).slice(0,5);
  else if (image_key) keys = [String(image_key).trim()];
  // juga dukung image_urls dari frontend lama? abaikan
  if (!tps_id || !kategori_pemilihan_id || keys.length===0) {
    return res.status(400).json({
      success: false,
      error: 'tps_id, kategori_pemilihan_id, dan image_key(s) wajib diisi (upload minimal 1 foto C1)'
    });
  }
  if (keys.length>5) return res.status(400).json({ success:false, error:'maksimal 5 foto C1' });
  if (!Number.isInteger(suara_sah) || suara_sah < 0) {
    return res.status(400).json({ success: false, error: 'suara_sah harus integer >= 0' });
  }
  if (!Number.isInteger(suara_tidak_sah) || suara_tidak_sah < 0) {
    return res.status(400).json({ success: false, error: 'suara_tidak_sah harus integer >= 0' });
  }
  if (!Array.isArray(detail_suara) || detail_suara.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'detail_suara wajib berupa array non-kosong berisi {kandidat_id, jumlah_suara}'
    });
  }
  // validasi DPT & hadir (opsional tapi presisi)
  let dpt = jumlah_dpt !== undefined && jumlah_dpt !== null && jumlah_dpt !== '' ? parseInt(jumlah_dpt,10) : null;
  let hadir = jumlah_hadir !== undefined && jumlah_hadir !== null && jumlah_hadir !== '' ? parseInt(jumlah_hadir,10) : null;
  if (dpt !== null && (!Number.isInteger(dpt) || dpt < 0 || dpt > 800)) {
    return res.status(400).json({ success: false, error: 'jumlah_dpt harus 0-800' });
  }
  if (hadir !== null && (!Number.isInteger(hadir) || hadir < 0 || hadir > 800)) {
    return res.status(400).json({ success: false, error: 'jumlah_hadir harus 0-800' });
  }
  if (dpt !== null && hadir !== null && hadir > dpt) {
    return res.status(400).json({ success: false, error: 'jumlah_hadir tidak boleh > jumlah_dpt' });
  }
  if (hadir !== null && (suara_sah + suara_tidak_sah) !== hadir) {
    // batal = tidak sah, hadir = sah + tidak sah
    return res.status(400).json({ success: false, error: `jumlah_hadir (${hadir}) harus = suara_sah (${suara_sah}) + suara_tidak_sah (${suara_tidak_sah})` });
  }
  // validasi surat suara (opsional)
  let jSurat = jumlah_surat_suara !== undefined && jumlah_surat_suara !== null && jumlah_surat_suara !== '' ? parseInt(jumlah_surat_suara,10) : null;
  let sBaik = surat_baik !== undefined && surat_baik !== null && surat_baik !== '' ? parseInt(surat_baik,10) : null;
  let sRusak = surat_rusak !== undefined && surat_rusak !== null && surat_rusak !== '' ? parseInt(surat_rusak,10) : null;
  let sCad = surat_cadangan !== undefined && surat_cadangan !== null && surat_cadangan !== '' ? parseInt(surat_cadangan,10) : null;
  for(const [v,n] of [[jSurat,'jumlah_surat_suara'],[sBaik,'surat_baik'],[sRusak,'surat_rusak'],[sCad,'surat_cadangan']]){
    if(v!==null && (!Number.isInteger(v) || v<0 || v>1000)) return res.status(400).json({success:false, error:`${n} harus 0-1000`});
  }
  if(jSurat!==null && sBaik!==null && sRusak!==null && sCad!==null){
    const sumSurat = (sBaik||0)+(sRusak||0)+(sCad||0);
    if(sumSurat > jSurat) return res.status(400).json({success:false, error:`surat_baik (${sBaik}) + rusak (${sRusak}) + cadangan (${sCad}) = ${sumSurat} tidak boleh > jumlah_surat_suara (${jSurat})`});
  }

  const payload = {
    tps_id,
    kategori_pemilihan_id,
    image_key: keys[0],
    image_keys: keys,
    suara_sah,
    suara_tidak_sah,
    detail_suara,
    jumlah_dpt: dpt,
    jumlah_hadir: hadir,
    jumlah_surat_suara: jSurat,
    surat_baik: sBaik,
    surat_rusak: sRusak,
    surat_cadangan: sCad,
    received_at: new Date().toISOString()
  };

  try {
    await c1Queue.add(JOB_NAME, payload, {
      removeOnComplete: 100000,
      removeOnFail: 100000
    });
    res.json({
      success: true,
      message: 'Data berhasil masuk antrean',
      queue: 'c1-queue',
      job: JOB_NAME,
      elapsed_ms: Date.now() - t0
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// [Issue #07] Endpoint Read Replica untuk Dashboard Publik Real-Time
// ----------------------------------------------------------------------------
const { readPool, readHost } = require('../db');

router.get('/kategori', async (req, res) => {
  try {
    const [rows] = await readPool.query(
      'SELECT id, nama_pemilihan FROM kategori_pemilihan ORDER BY id ASC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/rekapitulasi', async (req, res) => {
  const t0 = Date.now();
  const kategoriId = req.query.kategori_pemilihan_id || null;

  try {
    // 1. Ringkasan Suara & TPS
    const [summaryRows] = await readPool.query(
      `SELECT 
         COUNT(DISTINCT tps_id) AS tps_masuk,
         COALESCE(SUM(total_suara_sah), 0) AS total_suara_sah,
         COALESCE(SUM(total_suara_tidak_sah), 0) AS total_suara_tidak_sah,
         COUNT(*) AS total_transaksi
       FROM transaksi_c1
       WHERE (? IS NULL OR kategori_pemilihan_id = ?)`,
      [kategoriId, kategoriId]
    );

    // 2. Perolehan Suara per Kandidat
    const [kandidatRows] = await readPool.query(
      `SELECT 
         d.kandidat_id,
         COALESCE(k.nama, d.kandidat_id) AS nama_kandidat,
         k.no_urut,
         k.tipe_kandidat,
         SUM(d.jumlah_suara) AS total_suara
       FROM detail_suara d
       INNER JOIN transaksi_c1 t ON d.transaksi_c1_id = t.id
       LEFT JOIN master_kandidat k ON d.kandidat_id = k.id
       WHERE (? IS NULL OR t.kategori_pemilihan_id = ?)
       GROUP BY d.kandidat_id, k.nama, k.no_urut, k.tipe_kandidat
       ORDER BY total_suara DESC`,
      [kategoriId, kategoriId]
    );

    // 3. 5 Transaksi C1 Terbaru (Audit trail)
    const [latestRows] = await readPool.query(
      `SELECT id, tps_id, kategori_pemilihan_id, total_suara_sah, total_suara_tidak_sah, image_url, created_at
       FROM transaksi_c1
       WHERE (? IS NULL OR kategori_pemilihan_id = ?)
       ORDER BY created_at DESC
       LIMIT 5`,
      [kategoriId, kategoriId]
    );

    const totalSah = Number(summaryRows[0]?.total_suara_sah || 0);
    const kandidatWithPct = kandidatRows.map((k) => {
      const suara = Number(k.total_suara || 0);
      const persentase = totalSah > 0 ? ((suara / totalSah) * 100).toFixed(2) : '0.00';
      return {
        ...k,
        total_suara: suara,
        persentase: `${persentase}%`
      };
    });

    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      summary: {
        tps_masuk: Number(summaryRows[0]?.tps_masuk || 0),
        total_transaksi: Number(summaryRows[0]?.total_transaksi || 0),
        total_suara_sah: totalSah,
        total_suara_tidak_sah: Number(summaryRows[0]?.total_suara_tidak_sah || 0),
        total_suara_masuk: totalSah + Number(summaryRows[0]?.total_suara_tidak_sah || 0)
      },
      perolehan_suara: kandidatWithPct,
      transaksi_terbaru: latestRows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;