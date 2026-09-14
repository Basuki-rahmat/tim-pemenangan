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
const { requireAdmin, hashPassword, genPassword, verifyPassword, bearerToken } = require('../auth');
const crypto = require('crypto');

const router = Router();

// --- Saksi session helpers (terpisah dari admin) ---
const SAKSI_TTL_MS = 12*60*60*1000;
function newSaksiToken(){ return crypto.randomBytes(32).toString('hex'); }
async function createSaksiSession(saksiId){
  const token=newSaksiToken();
  const exp=new Date(Date.now()+SAKSI_TTL_MS);
  await writePool.query('INSERT INTO saksi_sessions (token, saksi_id, expires_at) VALUES (?,?,?)', [token, saksiId, exp]);
  return {token, expires_at:exp};
}
async function getSaksiSession(token){
  if(!token) return null;
  const [rows]=await writePool.query(`SELECT s.token, s.expires_at, w.id as saksi_id, w.nama, w.nik, w.username, w.tps_id FROM saksi_sessions s JOIN saksi w ON w.id=s.saksi_id WHERE s.token=? LIMIT 1`, [token]);
  if(!rows.length) return null;
  if(new Date(rows[0].expires_at).getTime() < Date.now()){
    await writePool.query('DELETE FROM saksi_sessions WHERE token=?', [token]);
    return null;
  }
  return rows[0];
}
async function requireSaksi(req,res,next){
  try{
    const sess=await getSaksiSession(bearerToken(req));
    if(!sess) return res.status(401).json({success:false, error:'butuh login saksi'});
    req.saksi=sess; next();
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
}

// Kolom aman (password_hash TIDAK PERNAH dikirim ke klien)
const SAKSI_COLS = 'id, nama, nik, username, no_hp, tps_id, kandidat_id, keterangan, foto_ktp, bank, no_rekening, created_at';
const ALLOWED_BANK = ['BCA','BRI','BNI','MANDIRI','BSI','CIMB','CIMB NIAGA','DANAMON','PERMATA','BTN','BTPN','JENIUS','SEABANK','BANK JAGO','JAGO','DANA','OVO','GOPAY','SHOPEEPAY','LINKAJA','LAINNYA'];

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
function validBank(bank) {
  if (bank === undefined || bank === null || bank === '') return true;
  return ALLOWED_BANK.includes(String(bank).trim().toUpperCase());
}
function validRek(rek) {
  if (rek === undefined || rek === null || rek === '') return true;
  return /^[0-9]{8,20}$/.test(String(rek).trim());
}

// --- Saksi Auth (HP) ---
router.post('/login', async (req,res)=>{
  const t0=Date.now();
  const login=String(req.body.username||req.body.nik||req.body.login||'').trim();
  const pass=String(req.body.password||'');
  if(!login||!pass) return res.status(400).json({success:false, error:'username/NIK dan password wajib'});
  try{
    const [rows]=await writePool.query('SELECT id, nama, nik, username, password_hash, tps_id FROM saksi WHERE username=? OR nik=? LIMIT 1', [login, login]);
    if(!rows.length || !verifyPassword(pass, rows[0].password_hash)){
      await new Promise(r=>setTimeout(r,300));
      return res.status(401).json({success:false, error:'username/NIK atau password salah'});
    }
    const sess=await createSaksiSession(rows[0].id);
    res.json({success:true, elapsed_ms:Date.now()-t0, data:{ id:rows[0].id, nama:rows[0].nama, nik:rows[0].nik, username:rows[0].username, tps_id:rows[0].tps_id, token:sess.token, expires_at:sess.expires_at }});
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
});
router.post('/logout', async (req,res)=>{
  try{ const tok=bearerToken(req); if(tok) await writePool.query('DELETE FROM saksi_sessions WHERE token=?',[tok]); res.json({success:true}); }catch(e){ res.status(500).json({success:false, error:e.message}); }
});
router.get('/me', requireSaksi, async (req,res)=>{
  try{
    const [tpsRows]=await writePool.query(`SELECT t.id, t.no_tps, d.nama desa, k.nama kecamatan, kb.nama kabupaten FROM master_tps t LEFT JOIN desa d ON d.id=t.desa_id LEFT JOIN kecamatan k ON k.id=d.kecamatan_id LEFT JOIN kabupaten kb ON kb.id=k.kabupaten_id WHERE t.id=? LIMIT 1`, [req.saksi.tps_id]);
    res.json({success:true, data:{ id:req.saksi.saksi_id, nama:req.saksi.nama, nik:req.saksi.nik, username:req.saksi.username, tps_id:req.saksi.tps_id, tps: tpsRows[0]||null, expires_at:req.saksi.expires_at }});
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
});
router.get('/dashboard', requireSaksi, async (req,res)=>{
  const t0=Date.now();
  try{
    const sid=req.saksi.saksi_id;
    const [abs]=await readPool.query('SELECT * FROM saksi_absensi WHERE saksi_id=? ORDER BY tanggal DESC LIMIT 5', [sid]);
    const [dana]=await readPool.query('SELECT * FROM saksi_dana WHERE saksi_id=? ORDER BY id DESC LIMIT 5', [sid]);
    const [[sum]]=await readPool.query('SELECT COALESCE(SUM(nominal),0) total, COALESCE(SUM(CASE WHEN status="CAIR" THEN nominal ELSE 0 END),0) cair FROM saksi_dana WHERE saksi_id=?', [sid]);
    const [tpsRows]=await readPool.query(`SELECT t.*, d.nama desa, k.nama kecamatan, kb.nama kabupaten FROM master_tps t LEFT JOIN desa d ON d.id=t.desa_id LEFT JOIN kecamatan k ON k.id=d.kecamatan_id LEFT JOIN kabupaten kb ON kb.id=k.kabupaten_id WHERE t.id=? LIMIT 1`, [req.saksi.tps_id]);
    res.json({success:true, elapsed_ms:Date.now()-t0, data:{ saksi:{id:sid, nama:req.saksi.nama, tps_id:req.saksi.tps_id}, tps: tpsRows[0]||null, absensi:abs, dana:dana, summary:{ total:Number(sum.total||0), cair:Number(sum.cair||0)} }});
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
});
// Saksi self absensi (kamera+GPS) & dana list
router.get('/absensi', requireSaksi, async (req,res)=>{
  try{
    const [rows]=await readPool.query('SELECT * FROM saksi_absensi WHERE saksi_id=? ORDER BY tanggal DESC', [req.saksi.saksi_id]);
    res.json({success:true, data:rows});
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
});
router.post('/absensi', requireSaksi, async (req,res)=>{
  const t0=Date.now();
  const status=String(req.body.status||'HADIR').trim().toUpperCase();
  const tanggal=req.body.tanggal? String(req.body.tanggal).trim() : new Date().toISOString().slice(0,10);
  const jam=req.body.jam_hadir? String(req.body.jam_hadir).trim().slice(0,8) : null;
  const foto=req.body.foto_bukti? String(req.body.foto_bukti).trim().slice(0,512) : null;
  const ket=req.body.keterangan? String(req.body.keterangan).trim().slice(0,256) : null;
  let lat=req.body.lat!==undefined&&req.body.lat!==''&&req.body.lat!==null? Number(req.body.lat): null;
  let lng=req.body.lng!==undefined&&req.body.lng!==''&&req.body.lng!==null? Number(req.body.lng): null;
  const STAT=['HADIR','TIDAK','IZIN','SAKIT'];
  if(!STAT.includes(status)) return res.status(400).json({success:false, error:'status '+STAT.join('/')});
  if(status==='HADIR' && !foto) return res.status(400).json({success:false, error:'foto wajib kamera'});
  if(status==='HADIR' && (lat===null||lng===null)) return res.status(400).json({success:false, error:'GPS wajib'});
  try{
    const sid=req.saksi.saksi_id;
    const [s]=await writePool.query('SELECT tps_id FROM saksi WHERE id=?', [sid]);
    const tpsId=s[0].tps_id;
    let jarak=null, valid=1;
    if(lat!==null && lng!==null){
      const [tps]=await writePool.query('SELECT lat,lng FROM master_tps WHERE id=?', [tpsId]);
      const tLat=tps[0]?.lat, tLng=tps[0]?.lng;
      if(tLat!=null && tLng!=null){
        const R=6371000, toRad=x=>x*Math.PI/180;
        const dLat=toRad(lat-Number(tLat)), dLon=toRad(lng-Number(tLng));
        const a=Math.sin(dLat/2)**2 + Math.cos(toRad(Number(tLat)))*Math.cos(toRad(lat))*Math.sin(dLon/2)**2;
        jarak=Math.round(2*R*Math.asin(Math.sqrt(a)));
        valid=jarak<=800?1:0;
        if(!valid) return res.status(400).json({success:false, error:`GPS di luar radius TPS (${jarak}m)`});
      }
    }
    const [r]=await writePool.query('INSERT INTO saksi_absensi (saksi_id,tps_id,tanggal,status,jam_hadir,foto_bukti,lat,lng,jarak_meter,is_gps_valid,keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [sid,tpsId,tanggal,status,jam,foto,lat,lng,jarak,valid,ket]);
    const [rows]=await writePool.query('SELECT * FROM saksi_absensi WHERE id=?', [r.insertId]);
    res.status(201).json({success:true, elapsed_ms:Date.now()-t0, data:rows[0]});
  }catch(e){
    if(e.code==='ER_DUP_ENTRY') return res.status(409).json({success:false, error:'Sudah absen tgl ini'});
    res.status(500).json({success:false, error:e.message});
  }
});
router.get('/dana-list', requireSaksi, async (req,res)=>{
  try{ const [rows]=await readPool.query('SELECT * FROM saksi_dana WHERE saksi_id=? ORDER BY id DESC', [req.saksi.saksi_id]); res.json({success:true, data:rows}); }catch(e){ res.status(500).json({success:false, error:e.message}); }
});
router.get('/c1', requireSaksi, async (req,res)=>{
  try{
    const tpsId=req.saksi.tps_id;
    const limit=Math.min(Math.max(parseInt(req.query.limit,10)||5,1),20);
    const offset=Math.max(parseInt(req.query.offset,10)||0,0);
    const [[c]]=await readPool.query('SELECT COUNT(*) total FROM transaksi_c1 WHERE tps_id=?', [tpsId]);
    const [rows]=await readPool.query('SELECT id, tps_id, kategori_pemilihan_id, jumlah_dpt, jumlah_hadir, jumlah_surat_suara, surat_baik, surat_rusak, surat_cadangan, total_suara_sah, total_suara_tidak_sah, image_url, image_urls, status_ocr, created_at FROM transaksi_c1 WHERE tps_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?', [tpsId, limit, offset]);
    res.json({success:true, total:Number(c.total||0), data:rows});
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
});

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
  const fotoKtp = req.body.foto_ktp === undefined || req.body.foto_ktp === null || req.body.foto_ktp === ''
    ? null : String(req.body.foto_ktp).trim().slice(0, 512);
  const bank = req.body.bank === undefined || req.body.bank === null || req.body.bank === ''
    ? null : String(req.body.bank).trim().toUpperCase().slice(0, 32);
  const noRek = req.body.no_rekening === undefined || req.body.no_rekening === null || req.body.no_rekening === ''
    ? null : String(req.body.no_rekening).trim().slice(0, 64);
  if (bank && !validBank(bank)) return res.status(400).json({ success: false, error: 'bank tidak valid. Pilihan: ' + ALLOWED_BANK.join(', ') });
  if (noRek && !validRek(noRek)) return res.status(400).json({ success: false, error: 'no_rekening harus 8-20 digit angka' });
  if (!fotoKtp && (bank || noRek)) {
    // bank/rekening opsional, tapi jika diisi perlu konsisten; foto KTP tetap opsional
  }
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
      'INSERT INTO saksi (nama, nik, username, no_hp, tps_id, kandidat_id, keterangan, foto_ktp, bank, no_rekening) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nama, nik, wantUsername, noHp, tpsId, kandidatId, keterangan, fotoKtp, bank, noRek]
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
  if (req.body.foto_ktp !== undefined) {
    const fktp = req.body.foto_ktp === '' || req.body.foto_ktp === null ? null : String(req.body.foto_ktp).trim().slice(0, 512);
    sets.push('foto_ktp = ?');
    vals.push(fktp);
  }
  if (req.body.bank !== undefined) {
    const b = req.body.bank === '' || req.body.bank === null ? null : String(req.body.bank).trim().toUpperCase().slice(0, 32);
    if (b && !validBank(b)) return res.status(400).json({ success: false, error: 'bank tidak valid. Pilihan: ' + ALLOWED_BANK.join(', ') });
    sets.push('bank = ?');
    vals.push(b);
  }
  if (req.body.no_rekening !== undefined) {
    const nr = req.body.no_rekening === '' || req.body.no_rekening === null ? null : String(req.body.no_rekening).trim().slice(0, 64);
    if (nr && !validRek(nr)) return res.status(400).json({ success: false, error: 'no_rekening harus 8-20 digit angka' });
    sets.push('no_rekening = ?');
    vals.push(nr);
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
