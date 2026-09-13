/**
 * ============================================================================
 * CRUD Registrasi Saksi TPS (hak Admin; baca publik untuk dropdown).
 * Aturan: nama wajib; NIK tepat 16 digit & unik (1 NIK = 1 TPS);
 * no_hp format 08xx (9–15 digit); tps_id wajib merujuk master_tps.
 *
 *   GET    /api/saksi[?tps_id=&desa_id=&kecamatan_id=&kabupaten_id=&search=&limit=&offset=]
 *   GET    /api/saksi/stat                       (rekap: total, per kab/kota)
 *   POST   /api/saksi                            (ADMIN)
 *   PUT    /api/saksi/:id                        (ADMIN)
 *   DELETE /api/saksi/:id                        (ADMIN)
 * ============================================================================
 */
const { Router } = require('express');
const { readPool, readHost, writePool } = require('../db');
const { requireAdmin, hashPassword, genPassword } = require('../auth');

const router = Router();

// Kolom aman (password_hash TIDAK PERNAH dikirim ke klien)
const SAKSI_COLS = 'id, nama, nik, username, no_hp, tps_id, kandidat_id, keterangan, created_at';

function likeParam(search) {
  return `%${String(search).replace(/[%_]/g, '')}%`;
}

function validNik(nik) {
  return /^[0-9]{16}$/.test(String(nik || ''));
}

function validHp(hp) {
  if (hp === undefined || hp === null || hp === '') return true;
  return /^08[0-9]{7,13}$/.test(String(hp).trim());
}

router.get('/', async (req, res) => {
  const t0 = Date.now();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const tpsId = req.query.tps_id || null;
  const desaId = req.query.desa_id || null;
  const kecamatanId = req.query.kecamatan_id || null;
  const kabupatenId = req.query.kabupaten_id || null;
  const search = req.query.search || null;
  try {
    const where = `( ? IS NULL OR s.tps_id = ? )
      AND ( ? IS NULL OR t.desa_id = ? )
      AND ( ? IS NULL OR k.id = ? )
      AND ( ? IS NULL OR kb.id = ? )
      AND ( ? IS NULL OR s.nama LIKE ? OR s.nik LIKE ? )`;
    const params = [tpsId, tpsId, desaId, desaId, kecamatanId, kecamatanId,
      kabupatenId, kabupatenId, search, search ? likeParam(search) : null, search ? likeParam(search) : null];
    const [[c]] = await readPool.query(
      `SELECT COUNT(*) AS total FROM saksi s
        LEFT JOIN master_tps t ON t.id = s.tps_id
        LEFT JOIN desa d ON d.id = t.desa_id
        LEFT JOIN kecamatan k ON k.id = d.kecamatan_id
        LEFT JOIN kabupaten kb ON kb.id = k.kabupaten_id
       WHERE ${where}`,
      params
    );
    const [rows] = await readPool.query(
      `SELECT s.${SAKSI_COLS.split(', ').join(', s.')}, t.no_tps, d.nama AS desa, k.nama AS kecamatan, kb.nama AS kabupaten,
              m.nama AS kandidat_nama
         FROM saksi s
         LEFT JOIN master_kandidat m ON m.id = s.kandidat_id
         LEFT JOIN master_tps t ON t.id = s.tps_id
         LEFT JOIN desa d ON d.id = t.desa_id
         LEFT JOIN kecamatan k ON k.id = d.kecamatan_id
         LEFT JOIN kabupaten kb ON kb.id = k.kabupaten_id
        WHERE ${where}
        ORDER BY s.id DESC LIMIT ? OFFSET ?`,
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

router.get('/stat', async (req, res) => {
  const t0 = Date.now();
  try {
    const [[total]] = await readPool.query('SELECT COUNT(*) AS jml FROM saksi');
    const [[cov]] = await readPool.query('SELECT COUNT(DISTINCT tps_id) AS tps_terisi FROM saksi');
    const [perKab] = await readPool.query(
      `SELECT kb.nama AS kabupaten, COUNT(*) AS jml
         FROM saksi s
         LEFT JOIN master_tps t ON t.id = s.tps_id
         LEFT JOIN desa d ON d.id = t.desa_id
         LEFT JOIN kecamatan k ON k.id = d.kecamatan_id
         LEFT JOIN kabupaten kb ON kb.id = k.kabupaten_id
        GROUP BY kb.nama ORDER BY jml DESC`
    );
    res.json({
      success: true, elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      data: {
        total: Number(total.jml || 0),
        tps_terisi: Number(cov.tps_terisi || 0),
        per_kabupaten: perKab.map((r) => ({ kabupaten: r.kabupaten || '-', jml: Number(r.jml) }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const nama = String(req.body.nama || '').trim().replace(/\s+/g, ' ').slice(0, 128);
  const nik = String(req.body.nik || '').trim();
  const noHp = req.body.no_hp === undefined || req.body.no_hp === null || req.body.no_hp === ''
    ? null
    : String(req.body.no_hp).trim();
  const tpsId = String(req.body.tps_id || '').trim().slice(0, 24);
  const keterangan = req.body.keterangan === undefined || req.body.keterangan === null || req.body.keterangan === ''
    ? null
    : String(req.body.keterangan).trim().slice(0, 256);
  const wantUsername = req.body.username === undefined || req.body.username === null || req.body.username === ''
    ? null
    : String(req.body.username).trim().toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 32);
  if (!nama) return res.status(400).json({ success: false, error: 'nama wajib diisi' });
  if (!validNik(nik)) return res.status(400).json({ success: false, error: 'NIK wajib 16 digit angka' });
  if (!noHp || !validHp(noHp)) {
    return res.status(400).json({ success: false, error: 'no_hp wajib diisi (format 08xx, untuk kirim WA)' });
  }
  if (!tpsId) return res.status(400).json({ success: false, error: 'tps_id wajib diisi' });
  const kandidatId = req.body.kandidat_id === undefined || req.body.kandidat_id === null || req.body.kandidat_id === ''
    ? null
    : String(req.body.kandidat_id).trim().toUpperCase().slice(0, 64);
  try {
    const [tps] = await writePool.query('SELECT id FROM master_tps WHERE id = ?', [tpsId]);
    if (tps.length === 0) return res.status(400).json({ success: false, error: 'TPS tidak ditemukan di master' });
    if (kandidatId) {
      const [kand] = await writePool.query('SELECT id FROM master_kandidat WHERE id = ?', [kandidatId]);
      if (kand.length === 0) return res.status(400).json({ success: false, error: 'kandidat tidak ditemukan' });
    }
    if (wantUsername) {
      const [dup] = await writePool.query('SELECT id FROM saksi WHERE username = ?', [wantUsername]);
      if (dup.length > 0) return res.status(409).json({ success: false, error: 'username sudah dipakai' });
    }
    const [r] = await writePool.query(
      'INSERT INTO saksi (nama, nik, username, no_hp, tps_id, kandidat_id, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nama, nik, wantUsername, noHp, tpsId, kandidatId, keterangan]
    );
    // Username otomatis + password acak (plaintext hanya dikembalikan sekali di sini)
    const username = wantUsername || ('sk' + String(r.insertId).padStart(6, '0'));
    const password = genPassword();
    await writePool.query('UPDATE saksi SET username = ?, password_hash = ? WHERE id = ?', [
      username, hashPassword(password), r.insertId
    ]);
    const [rows] = await writePool.query(`SELECT ${SAKSI_COLS} FROM saksi WHERE id = ?`, [r.insertId]);
    res.status(201).json({
      success: true, elapsed_ms: Date.now() - t0,
      data: { ...rows[0], password }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const msg = String(err.sqlMessage || '');
      if (msg.includes('uq_saksi_nik')) {
        return res.status(409).json({ success: false, error: 'NIK sudah terdaftar (1 NIK = 1 TPS)' });
      }
      return res.status(409).json({ success: false, error: 'username sudah dipakai' });
    }
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
  if (req.body.nik !== undefined) {
    const nik = String(req.body.nik).trim();
    if (!validNik(nik)) return res.status(400).json({ success: false, error: 'NIK wajib 16 digit angka' });
    sets.push('nik = ?');
    vals.push(nik);
  }
  if (req.body.no_hp !== undefined) {
    const noHp = req.body.no_hp === '' || req.body.no_hp === null ? null : String(req.body.no_hp).trim();
    if (!validHp(noHp)) return res.status(400).json({ success: false, error: 'no_hp format 08xx (9–15 digit)' });
    sets.push('no_hp = ?');
    vals.push(noHp);
  }
  if (req.body.tps_id !== undefined) {
    const tpsId = String(req.body.tps_id).trim().slice(0, 24);
    if (!tpsId) return res.status(400).json({ success: false, error: 'tps_id tidak boleh kosong' });
    const [tps] = await writePool.query('SELECT id FROM master_tps WHERE id = ?', [tpsId]);
    if (tps.length === 0) return res.status(400).json({ success: false, error: 'TPS tidak ditemukan di master' });
    sets.push('tps_id = ?');
    vals.push(tpsId);
  }
  if (req.body.keterangan !== undefined) {
    const ket = req.body.keterangan === '' || req.body.keterangan === null
      ? null
      : String(req.body.keterangan).trim().slice(0, 256);
    sets.push('keterangan = ?');
    vals.push(ket);
  }
  if (req.body.kandidat_id !== undefined) {
    const kandidatId = req.body.kandidat_id === '' || req.body.kandidat_id === null
      ? null
      : String(req.body.kandidat_id).trim().toUpperCase().slice(0, 64);
    if (kandidatId) {
      const [kand] = await writePool.query('SELECT id FROM master_kandidat WHERE id = ?', [kandidatId]);
      if (kand.length === 0) return res.status(400).json({ success: false, error: 'kandidat tidak ditemukan' });
    }
    sets.push('kandidat_id = ?');
    vals.push(kandidatId);
  }
  if (req.body.username !== undefined) {
    const uname = req.body.username === '' || req.body.username === null
      ? null
      : String(req.body.username).trim().toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 32);
    if (uname) {
      const [dup] = await writePool.query('SELECT id FROM saksi WHERE username = ? AND id <> ?', [
        uname, req.params.id
      ]);
      if (dup.length > 0) return res.status(400).json({ success: false, error: 'username sudah dipakai' });
    }
    sets.push('username = ?');
    vals.push(uname);
  }
  if (sets.length === 0) return res.status(400).json({ success: false, error: 'tidak ada field yang diubah' });
  try {
    const [r] = await writePool.query(`UPDATE saksi SET ${sets.join(', ')} WHERE id = ?`, [
      ...vals, req.params.id
    ]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'saksi tidak ditemukan' });
    const [rows] = await writePool.query(`SELECT ${SAKSI_COLS} FROM saksi WHERE id = ?`, [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'NIK sudah terdaftar (1 NIK = 1 TPS)' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await writePool.query(`SELECT ${SAKSI_COLS} FROM saksi WHERE id = ? LIMIT 1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'saksi tidak ditemukan' });
    // Baris lama bisa belum punya username → buatkan otomatis sekalian
    let username = rows[0].username;
    if (!username) {
      username = 'sk' + String(rows[0].id).padStart(6, '0');
      await writePool.query('UPDATE saksi SET username = ? WHERE id = ?', [username, req.params.id]);
      rows[0].username = username;
    }
    const password = genPassword();
    await writePool.query('UPDATE saksi SET password_hash = ? WHERE id = ?', [
      hashPassword(password), req.params.id
    ]);
    res.json({
      success: true, elapsed_ms: Date.now() - t0,
      data: { ...rows[0], password }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await writePool.query(`SELECT ${SAKSI_COLS} FROM saksi WHERE id = ? LIMIT 1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'saksi tidak ditemukan' });
    await writePool.query('DELETE FROM saksi WHERE id = ?', [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
