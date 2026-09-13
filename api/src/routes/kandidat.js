/**
 * ============================================================================
 * CRUD Kategori Pemilihan & Kandidat (hak Admin).
 * Publik boleh baca (dropdown form saksi & dashboard); tulis wajib login.
 *
 *   GET    /api/kandidat/kategori[?search=]
 *   POST   /api/kandidat/kategori          { id, nama_pemilihan }              (ADMIN)
 *   PUT    /api/kandidat/kategori/:id      { nama_pemilihan }                  (ADMIN)
 *   DELETE /api/kandidat/kategori/:id                                          (ADMIN)
 *   GET    /api/kandidat/list?kategori_pemilihan_id=&tipe=&search=
 *   POST   /api/kandidat/list              { id, kategori_pemilihan_id,        (ADMIN)
 *                                            dapil_id?, tipe_kandidat, nama,
 *                                            no_urut, foto?, partai? }
 *   PUT    /api/kandidat/list/:id          { ... }                             (ADMIN)
 *   DELETE /api/kandidat/list/:id                                              (ADMIN)
 *
 * tipe_kandidat: PASLON | PARTAI | CALEG | DPD
 * ============================================================================
 */
const { Router } = require('express');
const { readPool, readHost, writePool } = require('../db');
const { requireAdmin } = require('../auth');

const router = Router();
const TIPE = ['PASLON', 'PARTAI', 'CALEG', 'DPD'];

function likeParam(search) {
  return `%${String(search).replace(/[%_]/g, '')}%`;
}

// ---------------- KATEGORI (publik baca) ----------------

router.get('/kategori', async (req, res) => {
  const t0 = Date.now();
  const search = req.query.search || null;
  try {
    const [rows] = await readPool.query(
      `SELECT k.id, k.nama_pemilihan,
              (SELECT COUNT(*) FROM master_kandidat m WHERE m.kategori_pemilihan_id = k.id) AS jml_kandidat
         FROM kategori_pemilihan k
        WHERE (? IS NULL OR k.nama_pemilihan LIKE ? OR k.id LIKE ?)
        ORDER BY k.id ASC`,
      [search, search ? likeParam(search) : null, search ? likeParam(search) : null]
    );
    res.json({
      success: true, elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`, total: rows.length, data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/kategori', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const id = String(req.body.id || '').trim().toUpperCase().slice(0, 32);
  const nama = String(req.body.nama_pemilihan || '').trim().replace(/\s+/g, ' ').slice(0, 128);
  if (!id) return res.status(400).json({ success: false, error: 'id kategori wajib diisi' });
  if (!nama) return res.status(400).json({ success: false, error: 'nama_pemilihan wajib diisi' });
  try {
    const [dup] = await writePool.query('SELECT id FROM kategori_pemilihan WHERE id = ?', [id]);
    if (dup.length > 0) return res.status(409).json({ success: false, error: 'id kategori sudah dipakai' });
    await writePool.query('INSERT INTO kategori_pemilihan (id, nama_pemilihan) VALUES (?, ?)', [id, nama]);
    res.status(201).json({ success: true, elapsed_ms: Date.now() - t0, data: { id, nama_pemilihan: nama } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/kategori/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const nama = String(req.body.nama_pemilihan || '').trim().replace(/\s+/g, ' ').slice(0, 128);
  if (!nama) return res.status(400).json({ success: false, error: 'nama_pemilihan wajib diisi' });
  try {
    const [r] = await writePool.query('UPDATE kategori_pemilihan SET nama_pemilihan = ? WHERE id = ?', [
      nama, req.params.id
    ]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'kategori tidak ditemukan' });
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: { id: req.params.id, nama_pemilihan: nama } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/kategori/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await writePool.query('SELECT * FROM kategori_pemilihan WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'kategori tidak ditemukan' });
    const [kand] = await writePool.query(
      'SELECT COUNT(*) AS jml FROM master_kandidat WHERE kategori_pemilihan_id = ?', [req.params.id]
    );
    if (Number(kand[0].jml) > 0) {
      return res.status(409).json({
        success: false, error: `tidak bisa dihapus: masih memiliki ${kand[0].jml} kandidat`
      });
    }
    const [trx] = await writePool.query(
      'SELECT COUNT(*) AS jml FROM transaksi_c1 WHERE kategori_pemilihan_id = ?', [req.params.id]
    );
    if (Number(trx[0].jml) > 0) {
      return res.status(409).json({
        success: false, error: `tidak bisa dihapus: sudah ada ${trx[0].jml} transaksi C1 masuk`
      });
    }
    await writePool.query('DELETE FROM kategori_pemilihan WHERE id = ?', [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------- KANDIDAT (publik baca) ----------------

router.get('/list', async (req, res) => {
  const t0 = Date.now();
  const kategori = req.query.kategori_pemilihan_id || req.query.kategori || null;
  const dapilId = req.query.dapil_id || req.query.dapil || null;
  const tipe = (req.query.tipe || '').toUpperCase() || null;
  const search = req.query.search || null;
  if (tipe && !TIPE.includes(tipe)) {
    return res.status(400).json({ success: false, error: 'tipe harus salah satu: ' + TIPE.join(', ') });
  }
  try {
    const [rows] = await readPool.query(
      `SELECT m.id, m.kategori_pemilihan_id, m.dapil_id, m.tipe_kandidat, m.nama, m.foto, m.partai, m.no_urut,
              k.nama_pemilihan, d.nama AS dapil_nama, d.kode AS dapil_kode
         FROM master_kandidat m
         LEFT JOIN kategori_pemilihan k ON k.id = m.kategori_pemilihan_id
         LEFT JOIN dapil d ON d.id = m.dapil_id
        WHERE (? IS NULL OR m.kategori_pemilihan_id = ?)
          AND (? IS NULL OR m.dapil_id = ?)
          AND (? IS NULL OR m.tipe_kandidat = ?)
          AND (? IS NULL OR m.nama LIKE ? OR m.id LIKE ?)
        ORDER BY m.kategori_pemilihan_id ASC, m.no_urut ASC`,
      [kategori, kategori, dapilId, dapilId, tipe, tipe, search, search ? likeParam(search) : null, search ? likeParam(search) : null]
    );
    res.json({
      success: true, elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`, total: rows.length, data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/list', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const id = String(req.body.id || '').trim().toUpperCase().slice(0, 64);
  const kategoriId = String(req.body.kategori_pemilihan_id || '').trim().toUpperCase();
  const tipe = String(req.body.tipe_kandidat || '').trim().toUpperCase();
  const nama = String(req.body.nama || '').trim().replace(/\s+/g, ' ').slice(0, 128);
  const noUrut = parseInt(req.body.no_urut, 10);
  const foto = req.body.foto !== undefined && req.body.foto !== null && req.body.foto !== ''
    ? String(req.body.foto).trim().slice(0, 512)
    : null;
  const partai = req.body.partai !== undefined && req.body.partai !== null && req.body.partai !== ''
    ? String(req.body.partai).trim().replace(/\s+/g, ' ').slice(0, 128)
    : null;
  const dapilId = req.body.dapil_id !== undefined && req.body.dapil_id !== null && req.body.dapil_id !== ''
    ? String(req.body.dapil_id).trim().toUpperCase().slice(0, 24)
    : null;
  if (!id) return res.status(400).json({ success: false, error: 'id kandidat wajib diisi' });
  if (!kategoriId) return res.status(400).json({ success: false, error: 'kategori_pemilihan_id wajib diisi' });
  if (!TIPE.includes(tipe)) {
    return res.status(400).json({ success: false, error: 'tipe_kandidat harus salah satu: ' + TIPE.join(', ') });
  }
  if (!nama) return res.status(400).json({ success: false, error: 'nama wajib diisi' });
  if (!Number.isInteger(noUrut) || noUrut < 1) {
    return res.status(400).json({ success: false, error: 'no_urut wajib angka >= 1' });
  }
  try {
    const [kat] = await writePool.query('SELECT id FROM kategori_pemilihan WHERE id = ?', [kategoriId]);
    if (kat.length === 0) return res.status(400).json({ success: false, error: 'kategori pemilihan tidak ditemukan' });
    if (dapilId) {
      const [dp] = await writePool.query('SELECT id FROM dapil WHERE id = ?', [dapilId]);
      if (dp.length === 0) return res.status(400).json({ success: false, error: 'dapil tidak ditemukan' });
    }
    const [dup] = await writePool.query('SELECT id FROM master_kandidat WHERE id = ?', [id]);
    if (dup.length > 0) return res.status(409).json({ success: false, error: 'id kandidat sudah dipakai' });
    await writePool.query(
      'INSERT INTO master_kandidat (id, kategori_pemilihan_id, dapil_id, tipe_kandidat, nama, foto, partai, no_urut) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, kategoriId, dapilId, tipe, nama, foto, partai, noUrut]
    );
    const [rows] = await writePool.query('SELECT * FROM master_kandidat WHERE id = ?', [id]);
    res.status(201).json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/list/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const sets = [];
  const vals = [];
  if (req.body.nama !== undefined) {
    const nama = String(req.body.nama).trim().replace(/\s+/g, ' ').slice(0, 128);
    if (!nama) return res.status(400).json({ success: false, error: 'nama tidak boleh kosong' });
    sets.push('nama = ?');
    vals.push(nama);
  }
  if (req.body.tipe_kandidat !== undefined) {
    const tipe = String(req.body.tipe_kandidat).trim().toUpperCase();
    if (!TIPE.includes(tipe)) {
      return res.status(400).json({ success: false, error: 'tipe_kandidat harus salah satu: ' + TIPE.join(', ') });
    }
    sets.push('tipe_kandidat = ?');
    vals.push(tipe);
  }
  if (req.body.no_urut !== undefined) {
    const noUrut = parseInt(req.body.no_urut, 10);
    if (!Number.isInteger(noUrut) || noUrut < 1) {
      return res.status(400).json({ success: false, error: 'no_urut wajib angka >= 1' });
    }
    sets.push('no_urut = ?');
    vals.push(noUrut);
  }
  if (req.body.kategori_pemilihan_id !== undefined) {
    const kategoriId = String(req.body.kategori_pemilihan_id).trim().toUpperCase();
    const [kat] = await writePool.query('SELECT id FROM kategori_pemilihan WHERE id = ?', [kategoriId]);
    if (kat.length === 0) return res.status(400).json({ success: false, error: 'kategori pemilihan tidak ditemukan' });
    sets.push('kategori_pemilihan_id = ?');
    vals.push(kategoriId);
  }
  if (req.body.foto !== undefined) {
    sets.push('foto = ?');
    vals.push(req.body.foto === '' || req.body.foto === null ? null : String(req.body.foto).trim().slice(0, 512));
  }
  if (req.body.partai !== undefined) {
    const partai = String(req.body.partai).trim().replace(/\s+/g, ' ').slice(0, 128);
    sets.push('partai = ?');
    vals.push(partai === '' ? null : partai);
  }
  if (req.body.dapil_id !== undefined) {
    const dapilId = req.body.dapil_id === '' || req.body.dapil_id === null
      ? null
      : String(req.body.dapil_id).trim().toUpperCase().slice(0, 24);
    if (dapilId) {
      const [dp] = await writePool.query('SELECT id FROM dapil WHERE id = ?', [dapilId]);
      if (dp.length === 0) return res.status(400).json({ success: false, error: 'dapil tidak ditemukan' });
    }
    sets.push('dapil_id = ?');
    vals.push(dapilId);
  }
  if (sets.length === 0) return res.status(400).json({ success: false, error: 'tidak ada field yang diubah' });
  try {
    const [r] = await writePool.query(`UPDATE master_kandidat SET ${sets.join(', ')} WHERE id = ?`, [
      ...vals, req.params.id
    ]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'kandidat tidak ditemukan' });
    const [rows] = await writePool.query('SELECT * FROM master_kandidat WHERE id = ?', [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/list/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await writePool.query('SELECT * FROM master_kandidat WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'kandidat tidak ditemukan' });
    const [used] = await writePool.query(
      'SELECT COUNT(*) AS jml FROM detail_suara WHERE kandidat_id = ?', [req.params.id]
    );
    if (Number(used[0].jml) > 0) {
      return res.status(409).json({
        success: false, error: `tidak bisa dihapus: sudah dipakai di ${used[0].jml} detail suara`
      });
    }
    await writePool.query('DELETE FROM master_kandidat WHERE id = ?', [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
