/**
 * ============================================================================
 * CRUD Dapil + komposisi anggota (hak Admin; baca publik).
 * Aturan KPU: DPR_RI & DPRD_PROV beranggotakan kabupaten/kota;
 * DPRD_KABKOTA beranggotakan kecamatan (wajib dalam kabupaten dapil);
 * DPD tanpa komposisi (se-provinsi).
 *
 *   GET    /api/dapil[?tingkat=&search=]
 *   GET    /api/dapil/:id                      (detail + anggota)
 *   POST   /api/dapil                          (ADMIN)
 *   PUT    /api/dapil/:id                      (ADMIN)
 *   DELETE /api/dapil/:id                      (ADMIN, hapus anggota sekalian)
 *   POST   /api/dapil/:id/anggota  {kabupaten_id} / {kecamatan_id}   (ADMIN)
 *   DELETE /api/dapil/:id/anggota/:childId                             (ADMIN)
 * ============================================================================
 */
const { Router } = require('express');
const { readPool, readHost, writePool } = require('../db');
const { requireAdmin } = require('../auth');

const router = Router();
const TINGKAT = ['DPR_RI', 'DPD', 'DPRD_PROV', 'DPRD_KABKOTA'];

function likeParam(search) {
  return `%${String(search).replace(/[%_]/g, '')}%`;
}

function anggotaTable(tingkat) {
  if (tingkat === 'DPR_RI' || tingkat === 'DPRD_PROV') {
    return { table: 'dapil_kabupaten', col: 'kabupaten_id', ref: 'kabupaten', label: 'kabupaten/kota' };
  }
  if (tingkat === 'DPRD_KABKOTA') {
    return { table: 'dapil_kecamatan', col: 'kecamatan_id', ref: 'kecamatan', label: 'kecamatan' };
  }
  return null; // DPD
}

router.get('/', async (req, res) => {
  const t0 = Date.now();
  const tingkat = (req.query.tingkat || '').toUpperCase() || null;
  const search = req.query.search || null;
  if (tingkat && !TINGKAT.includes(tingkat)) {
    return res.status(400).json({ success: false, error: 'tingkat harus: ' + TINGKAT.join(', ') });
  }
  try {
    const [rows] = await readPool.query(
      `SELECT d.*, kb.nama AS kabupaten_nama,
              (SELECT COUNT(*) FROM dapil_kabupaten x WHERE x.dapil_id = d.id) +
              (SELECT COUNT(*) FROM dapil_kecamatan y WHERE y.dapil_id = d.id) AS jml_anggota
         FROM dapil d
         LEFT JOIN kabupaten kb ON kb.id = d.kabupaten_id
        WHERE (? IS NULL OR d.tingkat = ?)
          AND (? IS NULL OR d.nama LIKE ? OR d.kode LIKE ? OR d.id LIKE ?)
        ORDER BY d.tingkat ASC, d.kode ASC`,
      [tingkat, tingkat, search, search ? likeParam(search) : null, search ? likeParam(search) : null, search ? likeParam(search) : null]
    );
    res.json({
      success: true, elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`, total: rows.length, data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await readPool.query('SELECT * FROM dapil WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'dapil tidak ditemukan' });
    const d = rows[0];
    const cfg = anggotaTable(d.tingkat);
    let anggota = [];
    if (cfg) {
      if (cfg.ref === 'kabupaten') {
        const [r] = await readPool.query(
          `SELECT kb.id, kb.kode, kb.nama FROM ${cfg.table} x
            JOIN kabupaten kb ON kb.id = x.${cfg.col} WHERE x.dapil_id = ? ORDER BY kb.nama ASC`,
          [d.id]
        );
        anggota = r;
      } else {
        const [r] = await readPool.query(
          `SELECT k.id, k.kode, k.nama, kb.nama AS kabupaten FROM ${cfg.table} x
            JOIN kecamatan k ON k.id = x.${cfg.col}
            JOIN kabupaten kb ON kb.id = k.kabupaten_id
           WHERE x.dapil_id = ? ORDER BY k.nama ASC`,
          [d.id]
        );
        anggota = r;
      }
    }
    res.json({
      success: true, elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`, data: { ...d, anggota }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const id = String(req.body.id || '').trim().toUpperCase().slice(0, 24);
  const tingkat = String(req.body.tingkat || '').trim().toUpperCase();
  const kode = String(req.body.kode || '').trim().slice(0, 16);
  const nama = String(req.body.nama || '').trim().replace(/\s+/g, ' ').slice(0, 128);
  const jmlKursi = parseInt(req.body.jml_kursi, 10);
  const kabupatenId = req.body.kabupaten_id ?? null;
  if (!id) return res.status(400).json({ success: false, error: 'id dapil wajib diisi' });
  if (!TINGKAT.includes(tingkat)) {
    return res.status(400).json({ success: false, error: 'tingkat harus: ' + TINGKAT.join(', ') });
  }
  if (!kode) return res.status(400).json({ success: false, error: 'kode wajib diisi' });
  if (!nama) return res.status(400).json({ success: false, error: 'nama wajib diisi' });
  if (!Number.isInteger(jmlKursi) || jmlKursi < 1) {
    return res.status(400).json({ success: false, error: 'jml_kursi wajib angka >= 1' });
  }
  if (tingkat === 'DPRD_KABKOTA' && (kabupatenId === null || kabupatenId === '')) {
    return res.status(400).json({ success: false, error: 'kabupaten_id wajib untuk DPRD Kab/Kota' });
  }
  try {
    if (kabupatenId !== null && kabupatenId !== '') {
      const [kb] = await writePool.query('SELECT id FROM kabupaten WHERE id = ?', [kabupatenId]);
      if (kb.length === 0) return res.status(400).json({ success: false, error: 'kabupaten tidak ditemukan' });
    }
    const [dup] = await writePool.query('SELECT id FROM dapil WHERE id = ?', [id]);
    if (dup.length > 0) return res.status(409).json({ success: false, error: 'id dapil sudah dipakai' });
    await writePool.query(
      'INSERT INTO dapil (id, tingkat, kode, nama, provinsi_id, kabupaten_id, jml_kursi) VALUES (?, ?, ?, ?, 18, ?, ?)',
      [id, tingkat, kode, nama, kabupatenId === '' ? null : kabupatenId, jmlKursi]
    );
    const [rows] = await writePool.query('SELECT * FROM dapil WHERE id = ?', [id]);
    res.status(201).json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const sets = [];
  const vals = [];
  if (req.body.nama !== undefined) {
    const nama = String(req.body.nama).trim().replace(/\s+/g, ' ').slice(0, 128);
    if (!nama) return res.status(400).json({ success: false, error: 'nama tidak boleh kosong' });
    sets.push('nama = ?');
    vals.push(nama);
  }
  if (req.body.kode !== undefined) {
    const kode = String(req.body.kode).trim().slice(0, 16);
    if (!kode) return res.status(400).json({ success: false, error: 'kode tidak boleh kosong' });
    sets.push('kode = ?');
    vals.push(kode);
  }
  if (req.body.jml_kursi !== undefined) {
    const jmlKursi = parseInt(req.body.jml_kursi, 10);
    if (!Number.isInteger(jmlKursi) || jmlKursi < 1) {
      return res.status(400).json({ success: false, error: 'jml_kursi wajib angka >= 1' });
    }
    sets.push('jml_kursi = ?');
    vals.push(jmlKursi);
  }
  if (sets.length === 0) return res.status(400).json({ success: false, error: 'tidak ada field yang diubah' });
  try {
    const [r] = await writePool.query(`UPDATE dapil SET ${sets.join(', ')} WHERE id = ?`, [
      ...vals, req.params.id
    ]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'dapil tidak ditemukan' });
    const [rows] = await writePool.query('SELECT * FROM dapil WHERE id = ?', [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const conn = await writePool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM dapil WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, error: 'dapil tidak ditemukan' });
    }
    await conn.beginTransaction();
    await conn.query('DELETE FROM dapil_kabupaten WHERE dapil_id = ?', [req.params.id]);
    await conn.query('DELETE FROM dapil_kecamatan WHERE dapil_id = ?', [req.params.id]);
    await conn.query('DELETE FROM dapil WHERE id = ?', [req.params.id]);
    await conn.commit();
    conn.release();
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* abaikan */ }
    conn.release();
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/anggota', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await writePool.query('SELECT * FROM dapil WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'dapil tidak ditemukan' });
    const d = rows[0];
    const cfg = anggotaTable(d.tingkat);
    if (!cfg) return res.status(400).json({ success: false, error: 'DPD se-provinsi, tanpa komposisi anggota' });

    const childId = req.body[cfg.col];
    if (childId === undefined || childId === null || childId === '') {
      return res.status(400).json({ success: false, error: `${cfg.col} wajib diisi` });
    }
    if (cfg.ref === 'kabupaten') {
      const [ref] = await writePool.query('SELECT id FROM kabupaten WHERE id = ?', [childId]);
      if (ref.length === 0) return res.status(400).json({ success: false, error: 'kabupaten/kota tidak ditemukan' });
    } else {
      // KPU: kecamatan anggota wajib dalam kabupaten dapil
      const [ref] = await writePool.query('SELECT id, kabupaten_id FROM kecamatan WHERE id = ?', [childId]);
      if (ref.length === 0) return res.status(400).json({ success: false, error: 'kecamatan tidak ditemukan' });
      if (Number(ref[0].kabupaten_id) !== Number(d.kabupaten_id)) {
        return res.status(400).json({ success: false, error: 'kecamatan harus dalam kabupaten dapil ini' });
      }
    }
    await writePool.query(`INSERT IGNORE INTO ${cfg.table} (dapil_id, ${cfg.col}) VALUES (?, ?)`, [
      d.id, childId
    ]);
    res.status(201).json({ success: true, elapsed_ms: Date.now() - t0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id/anggota/:childId', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await writePool.query('SELECT * FROM dapil WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'dapil tidak ditemukan' });
    const cfg = anggotaTable(rows[0].tingkat);
    if (!cfg) return res.status(400).json({ success: false, error: 'DPD se-provinsi, tanpa komposisi anggota' });
    const [r] = await writePool.query(
      `DELETE FROM ${cfg.table} WHERE dapil_id = ? AND ${cfg.col} = ?`,
      [rows[0].id, req.params.childId]
    );
    if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'anggota tidak ditemukan di dapil ini' });
    res.json({ success: true, elapsed_ms: Date.now() - t0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
