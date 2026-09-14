/**
 * ============================================================================
 * Dashboard Admin (semua endpoint wajib login).
 *   GET /api/admin/overview     ringkasan suara + jumlah master + status antrean
 *   GET /api/admin/transaksi    daftar transaksi (paging, filter, cari)
 *     ?limit=20&offset=0&kategori_pemilihan_id=&tps=
 * ============================================================================
 */
const { Router } = require('express');
const { readPool, readHost } = require('../db');
const { requireAdmin } = require('../auth');
const { c1Queue } = require('../queue');

const router = Router();
router.use(requireAdmin);

router.get('/overview', async (req, res) => {
  const t0 = Date.now();
  try {
    const [[summary]] = await readPool.query(
      `SELECT COUNT(DISTINCT tps_id) AS tps_masuk,
              COUNT(*) AS total_transaksi,
              COALESCE(SUM(total_suara_sah), 0) AS total_suara_sah,
              COALESCE(SUM(total_suara_tidak_sah), 0) AS total_suara_tidak_sah
         FROM transaksi_c1`
    );

    const [perKategori] = await readPool.query(
      `SELECT t.kategori_pemilihan_id,
              COALESCE(k.nama_pemilihan, t.kategori_pemilihan_id) AS nama_pemilihan,
              COUNT(DISTINCT t.tps_id) AS tps_masuk,
              COUNT(*) AS total_transaksi,
              COALESCE(SUM(t.total_suara_sah), 0) AS suara_sah,
              COALESCE(SUM(t.total_suara_tidak_sah), 0) AS suara_tidak_sah
         FROM transaksi_c1 t
         LEFT JOIN kategori_pemilihan k ON k.id = t.kategori_pemilihan_id
        GROUP BY t.kategori_pemilihan_id, k.nama_pemilihan
        ORDER BY total_transaksi DESC`
    );

    const [[counts]] = await readPool.query(
      `SELECT (SELECT COUNT(*) FROM kategori_pemilihan) AS kategori,
              (SELECT COUNT(*) FROM master_kandidat) AS kandidat,
              (SELECT COUNT(*) FROM master_tps) AS tps_master,
              (SELECT COUNT(*) FROM provinsi) AS provinsi,
              (SELECT COUNT(*) FROM kabupaten) AS kabupaten,
              (SELECT COUNT(*) FROM kecamatan) AS kecamatan,
              (SELECT COUNT(*) FROM desa) AS desa,
              (SELECT COUNT(*) FROM admin_users) AS admin_users,
              (SELECT COUNT(*) FROM admin_sessions WHERE expires_at > NOW()) AS sesi_aktif`
    );

    let queue = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
    let queueError = null;
    try {
      queue = await c1Queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    } catch (err) {
      queueError = err.message;
    }

    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      summary: {
        tps_masuk: Number(summary.tps_masuk || 0),
        total_transaksi: Number(summary.total_transaksi || 0),
        total_suara_sah: Number(summary.total_suara_sah || 0),
        total_suara_tidak_sah: Number(summary.total_suara_tidak_sah || 0)
      },
      antrean: { ...queue, backlog: Number(queue.waiting || 0) + Number(queue.active || 0), error: queueError },
      master: counts,
      per_kategori: perKategori.map((r) => ({
        ...r,
        tps_masuk: Number(r.tps_masuk || 0),
        total_transaksi: Number(r.total_transaksi || 0),
        suara_sah: Number(r.suara_sah || 0),
        suara_tidak_sah: Number(r.suara_tidak_sah || 0)
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/transaksi', async (req, res) => {
  const t0 = Date.now();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const kategori = req.query.kategori_pemilihan_id || null;
  const tps = req.query.tps ? `%${String(req.query.tps).replace(/[%_]/g, '')}%` : null;
  try {
    const [[c]] = await readPool.query(
      `SELECT COUNT(*) AS total FROM transaksi_c1 t
        WHERE (? IS NULL OR t.kategori_pemilihan_id = ?)
          AND (? IS NULL OR t.tps_id LIKE ?)`,
      [kategori, kategori, tps, tps]
    );
    const [rows] = await readPool.query(
      `SELECT t.id, t.tps_id, t.kategori_pemilihan_id, t.jumlah_dpt, t.jumlah_hadir,
              t.total_suara_sah, t.total_suara_tidak_sah, t.image_url, t.status_ocr, t.created_at,
              COUNT(d.id) AS jml_detail
         FROM transaksi_c1 t
         LEFT JOIN detail_suara d ON d.transaksi_c1_id = t.id
        WHERE (? IS NULL OR t.kategori_pemilihan_id = ?)
          AND (? IS NULL OR t.tps_id LIKE ?)
        GROUP BY t.id, t.tps_id, t.kategori_pemilihan_id, t.jumlah_dpt, t.jumlah_hadir,
                 t.total_suara_sah, t.total_suara_tidak_sah, t.image_url, t.status_ocr, t.created_at
        ORDER BY t.created_at DESC
        LIMIT ? OFFSET ?`,
      [kategori, kategori, tps, tps, limit, offset]
    );
    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      total: Number(c.total || 0),
      limit,
      offset,
      data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
