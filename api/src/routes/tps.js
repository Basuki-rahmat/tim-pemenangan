/**
 * ============================================================================
 * CRUD Master TPS (hak Admin; baca publik).
 * Aturan KPU: 1 TPS terikat 1 desa/kelurahan (unik per desa+no_tps),
 * DPT per TPS maks 500 pemilih (CHECK di DB + validasi di sini).
 *
 *   GET    /api/tps[?desa_id=&kecamatan_id=&kabupaten_id=&search=&limit=&offset=]
 *   POST   /api/tps                 (ADMIN)
 *   PUT    /api/tps/:id             (ADMIN)
 *   DELETE /api/tps/:id             (ADMIN, tolak bila sudah ada transaksi)
 * ============================================================================
 */
const { Router } = require('express');
const { readPool, readHost, writePool } = require('../db');
const { requireAdmin } = require('../auth');

const router = Router();
const MAKS_PEMILIH = 500;

function likeParam(search) {
  return `%${String(search).replace(/[%_]/g, '')}%`;
}

// Ambil rantai teks wilayah dari desa_id (untuk kolom denormalisasi)
async function chainByDesa(pool, desaId) {
  const [rows] = await pool.query(
    `SELECT d.id AS desa_id, d.nama AS kelurahan,
            k.nama AS kecamatan, kb.nama AS kota, p.nama AS provinsi
       FROM desa d
       JOIN kecamatan k ON k.id = d.kecamatan_id
       JOIN kabupaten kb ON kb.id = k.kabupaten_id
       JOIN provinsi p ON p.id = kb.provinsi_id
      WHERE d.id = ? LIMIT 1`,
    [desaId]
  );
  return rows[0] || null;
}

router.get('/', async (req, res) => {
  const t0 = Date.now();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const desaId = req.query.desa_id || null;
  const kecamatanId = req.query.kecamatan_id || null;
  const kabupatenId = req.query.kabupaten_id || null;
  const search = req.query.search || null;
  try {
    const where = `( ? IS NULL OR t.desa_id = ? )
      AND ( ? IS NULL OR k.id = ? )
      AND ( ? IS NULL OR kb.id = ? )
      AND ( ? IS NULL OR t.id LIKE ? OR t.no_tps LIKE ? )`;
    const params = [desaId, desaId, kecamatanId, kecamatanId, kabupatenId, kabupatenId,
      search, search ? likeParam(search) : null, search ? likeParam(search) : null];
    const [[c]] = await readPool.query(
      `SELECT COUNT(*) AS total FROM master_tps t
        LEFT JOIN desa d ON d.id = t.desa_id
        LEFT JOIN kecamatan k ON k.id = d.kecamatan_id
        LEFT JOIN kabupaten kb ON kb.id = k.kabupaten_id
       WHERE ${where}`,
      params
    );
    const [rows] = await readPool.query(
      `SELECT t.*, d.nama AS desa_nama, k.nama AS kecamatan_nama, kb.nama AS kabupaten_nama
         FROM master_tps t
         LEFT JOIN desa d ON d.id = t.desa_id
         LEFT JOIN kecamatan k ON k.id = d.kecamatan_id
         LEFT JOIN kabupaten kb ON kb.id = k.kabupaten_id
        WHERE ${where}
        ORDER BY t.id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({
      success: true, elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      total: Number(c.total || 0), limit, offset, data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET satu TPS + rantai induk (untuk preload form edit)
router.get('/:id', async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await readPool.query(
      `SELECT t.*, d.id AS desa_id, k.id AS kecamatan_id, kb.id AS kabupaten_id
         FROM master_tps t
         LEFT JOIN desa d ON d.id = t.desa_id
         LEFT JOIN kecamatan k ON k.id = d.kecamatan_id
         LEFT JOIN kabupaten kb ON kb.id = k.kabupaten_id
        WHERE t.id = ? LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'TPS tidak ditemukan' });
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {  const t0 = Date.now();
  const id = String(req.body.id || '').trim().slice(0, 24);
  const noTps = String(req.body.no_tps || '').trim().slice(0, 8);
  const jumlah = req.body.jumlah_pemilih === undefined || req.body.jumlah_pemilih === null || req.body.jumlah_pemilih === ''
    ? 0
    : parseInt(req.body.jumlah_pemilih, 10);
  const desaId = req.body.desa_id ?? null;
  if (!id) return res.status(400).json({ success: false, error: 'id TPS wajib diisi (kode, mis. 1801012001001)' });
  if (!noTps) return res.status(400).json({ success: false, error: 'no_tps wajib diisi (mis. 001)' });
  if (!Number.isInteger(jumlah) || jumlah < 0 || jumlah > MAKS_PEMILIH) {
    return res.status(400).json({ success: false, error: `jumlah_pemilih 0–${MAKS_PEMILIH} (aturan KPU)` });
  }
  const lat = req.body.lat === undefined || req.body.lat === null || req.body.lat === ''
    ? null
    : Number(req.body.lat);
  const lng = req.body.lng === undefined || req.body.lng === null || req.body.lng === ''
    ? null
    : Number(req.body.lng);
  if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    return res.status(400).json({ success: false, error: 'lat harus -90 s/d 90' });
  }
  if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    return res.status(400).json({ success: false, error: 'lng harus -180 s/d 180' });
  }
  try {
    let provinsi = String(req.body.provinsi || '').trim().slice(0, 64);
    let kota = String(req.body.kota || '').trim().slice(0, 64);
    let kecamatan = String(req.body.kecamatan || '').trim().slice(0, 64);
    let kelurahan = String(req.body.kelurahan || '').trim().slice(0, 64);
    if (desaId !== null && desaId !== '') {
      const chain = await chainByDesa(writePool, desaId);
      if (!chain) return res.status(400).json({ success: false, error: 'desa tidak ditemukan' });
      provinsi = chain.provinsi;
      kota = chain.kota;
      kecamatan = chain.kecamatan;
      kelurahan = chain.kelurahan;
    }
    await writePool.query(
      'INSERT INTO master_tps (id, desa_id, provinsi, kota, kecamatan, kelurahan, no_tps, jumlah_pemilih, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, desaId === '' ? null : desaId, provinsi, kota, kecamatan, kelurahan, noTps, jumlah, lat, lng]
    );
    const [rows] = await writePool.query('SELECT * FROM master_tps WHERE id = ?', [id]);
    res.status(201).json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'TPS sudah terdaftar (id / pasangan desa+no_tps ganda)' });
    }
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      return res.status(400).json({ success: false, error: `jumlah_pemilih maks ${MAKS_PEMILIH} (aturan KPU)` });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const sets = [];
  const vals = [];
  const textCols = ['provinsi', 'kota', 'kecamatan', 'kelurahan'];
  for (const col of textCols) {
    if (req.body[col] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(String(req.body[col]).trim().slice(0, 64));
    }
  }
  if (req.body.no_tps !== undefined) {
    const noTps = String(req.body.no_tps).trim().slice(0, 8);
    if (!noTps) return res.status(400).json({ success: false, error: 'no_tps tidak boleh kosong' });
    sets.push('no_tps = ?');
    vals.push(noTps);
  }
  if (req.body.jumlah_pemilih !== undefined) {
    const jumlah = parseInt(req.body.jumlah_pemilih, 10);
    if (!Number.isInteger(jumlah) || jumlah < 0 || jumlah > MAKS_PEMILIH) {
      return res.status(400).json({ success: false, error: `jumlah_pemilih 0–${MAKS_PEMILIH} (aturan KPU)` });
    }
    sets.push('jumlah_pemilih = ?');
    vals.push(jumlah);
  }
  if (req.body.lat !== undefined || req.body.lng !== undefined) {
    const cur = await writePool.query('SELECT lat, lng FROM master_tps WHERE id = ?', [req.params.id])
      .then(([r]) => r[0]);
    if (!cur) return res.status(404).json({ success: false, error: 'TPS tidak ditemukan' });
    let newLat = cur.lat === null ? null : Number(cur.lat);
    let newLng = cur.lng === null ? null : Number(cur.lng);
    if (req.body.lat !== undefined) {
      newLat = req.body.lat === '' || req.body.lat === null ? null : Number(req.body.lat);
    }
    if (req.body.lng !== undefined) {
      newLng = req.body.lng === '' || req.body.lng === null ? null : Number(req.body.lng);
    }
    if (newLat !== null && (!Number.isFinite(newLat) || newLat < -90 || newLat > 90)) {
      return res.status(400).json({ success: false, error: 'lat harus -90 s/d 90' });
    }
    if (newLng !== null && (!Number.isFinite(newLng) || newLng < -180 || newLng > 180)) {
      return res.status(400).json({ success: false, error: 'lng harus -180 s/d 180' });
    }
    sets.push('lat = ?');
    vals.push(newLat);
    sets.push('lng = ?');
    vals.push(newLng);
  }
  if (req.body.desa_id !== undefined) {
    const desaId = req.body.desa_id === '' || req.body.desa_id === null ? null : req.body.desa_id;
    if (desaId !== null) {
      const chain = await writePool.query(
        'SELECT id FROM desa WHERE id = ?', [desaId]
      ).then(([r]) => r);
      if (chain.length === 0) return res.status(400).json({ success: false, error: 'desa tidak ditemukan' });
    }
    sets.push('desa_id = ?');
    vals.push(desaId);
  }
  if (sets.length === 0) return res.status(400).json({ success: false, error: 'tidak ada field yang diubah' });
  try {
    const [r] = await writePool.query(`UPDATE master_tps SET ${sets.join(', ')} WHERE id = ?`, [
      ...vals, req.params.id
    ]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'TPS tidak ditemukan' });
    const [rows] = await writePool.query('SELECT * FROM master_tps WHERE id = ?', [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'pasangan desa+no_tps sudah dipakai TPS lain' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await writePool.query('SELECT * FROM master_tps WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'TPS tidak ditemukan' });
    const [used] = await writePool.query('SELECT COUNT(*) AS jml FROM transaksi_c1 WHERE tps_id = ?', [
      req.params.id
    ]);
    if (Number(used[0].jml) > 0) {
      return res.status(409).json({
        success: false, error: `tidak bisa dihapus: sudah ada ${used[0].jml} transaksi C1 dari TPS ini`
      });
    }
    await writePool.query('DELETE FROM master_tps WHERE id = ?', [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
