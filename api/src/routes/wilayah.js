/**
 * ============================================================================
 * Endpoint Data Wilayah (Provinsi -> Kabupaten -> Kecamatan -> Desa)
 * Read-only via Read-Replica pool (Issue #07), mengikuti gaya routes/c1.js.
 *
 *   GET /api/wilayah/provinsi
 *   GET /api/wilayah/kabupaten?provinsi_id=18[&search=...]
 *   GET /api/wilayah/kecamatan?kabupaten_id=1809[&search=...]
 *   GET /api/wilayah/desa?kecamatan_id=151[&search=...]
 *   GET /api/wilayah/path?desa_id=123   (rantai desa->kec->kab->prov)
 * ============================================================================
 */
const { Router } = require('express');
const { readPool, readHost, writePool } = require('../db');
const { requireAdmin } = require('../auth');

const router = Router();

function likeParam(search) {
  return `%${String(search).replace(/[%_]/g, '')}%`;
}

router.get('/provinsi', async (req, res) => {
  const t0 = Date.now();
  try {
    const [rows] = await readPool.query(
      'SELECT id, nama FROM provinsi ORDER BY id ASC'
    );
    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/kabupaten', async (req, res) => {
  const t0 = Date.now();
  const provinsiId = req.query.provinsi_id || req.query.provinsi || null;
  const search = req.query.search || null;
  if (!provinsiId) {
    return res.json({ success: true, elapsed_ms: Date.now() - t0, source: `Read-Replica (${readHost})`, total: 0, data: [] });
  }
  try {
    const [rows] = await readPool.query(
      `SELECT id, provinsi_id, kode, nama
         FROM kabupaten
        WHERE (? IS NULL OR provinsi_id = ? OR kode = ?)
          AND (? IS NULL OR nama LIKE ?)
        ORDER BY nama ASC`,
      [provinsiId, provinsiId, provinsiId, search, search ? likeParam(search) : null]
    );
    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/kecamatan', async (req, res) => {
  const t0 = Date.now();
  const kabupatenId = req.query.kabupaten_id || req.query.kabupaten || null;
  const search = req.query.search || null;
  if (!kabupatenId) {
    return res.json({ success: true, elapsed_ms: Date.now() - t0, source: `Read-Replica (${readHost})`, total: 0, data: [] });
  }
  try {
    const [rows] = await readPool.query(
      `SELECT k.id, k.kabupaten_id, k.kode, k.nama, kb.nama AS kabupaten
         FROM kecamatan k
         JOIN kabupaten kb ON kb.id = k.kabupaten_id
        WHERE (? IS NULL OR k.kabupaten_id = ? OR k.kode LIKE CONCAT(?, '%'))
          AND (? IS NULL OR k.nama LIKE ?)
        ORDER BY k.nama ASC`,
      [kabupatenId, kabupatenId, kabupatenId, search, search ? likeParam(search) : null]
    );
    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/desa', async (req, res) => {
  const t0 = Date.now();
  const kecamatanId = req.query.kecamatan_id || req.query.kecamatan || null;
  const search = req.query.search || null;
  if (!kecamatanId) {
    return res.json({ success: true, elapsed_ms: Date.now() - t0, source: `Read-Replica (${readHost})`, total: 0, data: [] });
  }
  try {
    const [rows] = await readPool.query(
      `SELECT d.id, d.kecamatan_id, d.kode, d.nama, k.nama AS kecamatan
         FROM desa d
         JOIN kecamatan k ON k.id = d.kecamatan_id
        WHERE (? IS NULL OR d.kecamatan_id = ?)
          AND (? IS NULL OR d.nama LIKE ?)
        ORDER BY d.nama ASC`,
      [kecamatanId, kecamatanId, search, search ? likeParam(search) : null]
    );
    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/path', async (req, res) => {
  const t0 = Date.now();
  const desaId = req.query.desa_id || null;
  if (!desaId) {
    return res.status(400).json({ success: false, error: 'desa_id wajib diisi' });
  }
  try {
    const [rows] = await readPool.query(
      `SELECT d.id AS desa_id, d.nama AS desa, d.kode AS desa_kode,
              k.id AS kecamatan_id, k.nama AS kecamatan,
              kb.id AS kabupaten_id, kb.nama AS kabupaten,
              p.id AS provinsi_id, p.nama AS provinsi
         FROM desa d
         JOIN kecamatan k ON k.id = d.kecamatan_id
         JOIN kabupaten kb ON kb.id = k.kabupaten_id
         JOIN provinsi p ON p.id = kb.provinsi_id
        WHERE d.id = ?
        LIMIT 1`,
      [desaId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'desa tidak ditemukan' });
    }
    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      source: `Read-Replica (${readHost})`,
      data: rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// CRUD Admin Wilayah (tulis ke Primary via writePool)
// Aturan: nama wajib; induk harus ada; hapus ditolak bila masih punya anak.
// ----------------------------------------------------------------------------
const LEVELS = {
  provinsi: {
    table: 'provinsi', pk: 'id', manualId: true,
    parentCol: null, parentTable: null,
    child: { table: 'kabupaten', col: 'provinsi_id', label: 'kabupaten' }
  },
  kabupaten: {
    table: 'kabupaten', pk: 'id', manualId: false,
    parentCol: 'provinsi_id', parentTable: 'provinsi',
    child: { table: 'kecamatan', col: 'kabupaten_id', label: 'kecamatan' }
  },
  kecamatan: {
    table: 'kecamatan', pk: 'id', manualId: false,
    parentCol: 'kabupaten_id', parentTable: 'kabupaten',
    child: { table: 'desa', col: 'kecamatan_id', label: 'desa' }
  },
  desa: {
    table: 'desa', pk: 'id', manualId: false,
    parentCol: 'kecamatan_id', parentTable: 'kecamatan',
    child: null
  }
};

function cleanNama(nama) {
  if (typeof nama !== 'string') return '';
  return nama.trim().replace(/\s+/g, ' ').slice(0, 100);
}

// POST /api/wilayah/:level  — tambah data (ADMIN)
//   provinsi : { id, nama }            (id = kode Kemendagri, mis. 18)
//   lainnya  : { <parentCol>, nama, kode? }
router.post('/:level', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const cfg = LEVELS[req.params.level];
  if (!cfg) return res.status(404).json({ success: false, error: 'level tidak dikenal' });

  const nama = cleanNama(req.body.nama);
  if (!nama) return res.status(400).json({ success: false, error: 'nama wajib diisi' });
  const kode = req.body.kode !== undefined && req.body.kode !== null && req.body.kode !== ''
    ? String(req.body.kode).trim().slice(0, 10)
    : null;

  try {
    if (cfg.manualId) {
      const id = parseInt(req.body.id, 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ success: false, error: 'id provinsi wajib angka (kode Kemendagri)' });
      }
      const [dup] = await writePool.query(`SELECT id FROM ${cfg.table} WHERE id = ?`, [id]);
      if (dup.length > 0) return res.status(409).json({ success: false, error: 'id sudah dipakai' });
      await writePool.query(`INSERT INTO ${cfg.table} (id, nama) VALUES (?, ?)`, [id, nama]);
      return res.status(201).json({
        success: true, elapsed_ms: Date.now() - t0, data: { id, nama }
      });
    }

    const parentId = req.body[cfg.parentCol];
    if (parentId === undefined || parentId === null || parentId === '') {
      return res.status(400).json({ success: false, error: `${cfg.parentCol} wajib diisi` });
    }
    const [parent] = await writePool.query(
      `SELECT id FROM ${cfg.parentTable} WHERE id = ?`, [parentId]
    );
    if (parent.length === 0) {
      return res.status(400).json({ success: false, error: `induk tidak ditemukan di ${cfg.parentTable}` });
    }
    const [r] = await writePool.query(
      `INSERT INTO ${cfg.table} (${cfg.parentCol}, nama, kode) VALUES (?, ?, ?)`,
      [parentId, nama, kode]
    );
    const [rows] = await writePool.query(`SELECT * FROM ${cfg.table} WHERE id = ?`, [r.insertId]);
    res.status(201).json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/wilayah/:level/:id  — edit nama / kode / induk (ADMIN)
router.put('/:level/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const cfg = LEVELS[req.params.level];
  if (!cfg) return res.status(404).json({ success: false, error: 'level tidak dikenal' });

  const sets = [];
  const vals = [];
  if (req.body.nama !== undefined) {
    const nama = cleanNama(req.body.nama);
    if (!nama) return res.status(400).json({ success: false, error: 'nama tidak boleh kosong' });
    sets.push('nama = ?');
    vals.push(nama);
  }
  if (req.body.kode !== undefined) {
    sets.push('kode = ?');
    vals.push(req.body.kode === '' || req.body.kode === null ? null : String(req.body.kode).trim().slice(0, 10));
  }
  if (cfg.parentCol && req.body[cfg.parentCol] !== undefined) {
    const [parent] = await writePool.query(
      `SELECT id FROM ${cfg.parentTable} WHERE id = ?`, [req.body[cfg.parentCol]]
    );
    if (parent.length === 0) {
      return res.status(400).json({ success: false, error: `induk tidak ditemukan di ${cfg.parentTable}` });
    }
    sets.push(`${cfg.parentCol} = ?`);
    vals.push(req.body[cfg.parentCol]);
  }
  if (sets.length === 0) {
    return res.status(400).json({ success: false, error: 'tidak ada field yang diubah' });
  }

  try {
    const [r] = await writePool.query(
      `UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = ?`,
      [...vals, req.params.id]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'data tidak ditemukan' });
    }
    const [rows] = await writePool.query(`SELECT * FROM ${cfg.table} WHERE id = ?`, [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/wilayah/:level/:id  — hapus bila tidak punya anak (ADMIN)
router.delete('/:level/:id', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  const cfg = LEVELS[req.params.level];
  if (!cfg) return res.status(404).json({ success: false, error: 'level tidak dikenal' });

  try {
    const [rows] = await writePool.query(`SELECT * FROM ${cfg.table} WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'data tidak ditemukan' });

    if (cfg.child) {
      const [kids] = await writePool.query(
        `SELECT COUNT(*) AS jml FROM ${cfg.child.table} WHERE ${cfg.child.col} = ?`,
        [req.params.id]
      );
      if (Number(kids[0].jml) > 0) {
        return res.status(409).json({
          success: false,
          error: `tidak bisa dihapus: masih memiliki ${kids[0].jml} ${cfg.child.label}`
        });
      }
    }
    await writePool.query(`DELETE FROM ${cfg.table} WHERE id = ?`, [req.params.id]);
    res.json({ success: true, elapsed_ms: Date.now() - t0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
