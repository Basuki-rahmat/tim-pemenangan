/**
 * CRUD Absensi Saksi TPS (Admin)
 *  GET    /api/absensi[?saksi_id=&tps_id=&tanggal=&status=&search=&limit=&offset=]
 *  POST   /api/absensi  { saksi_id, tanggal?, status?, jam_hadir?, foto_bukti?, keterangan? } (ADMIN)
 *  PUT    /api/absensi/:id { ... } (ADMIN)
 *  DELETE /api/absensi/:id (ADMIN)
 */
const { Router } = require('express');
const { readPool, readHost, writePool } = require('../db');
const { requireAdmin } = require('../auth');
const router = Router();
const STAT = ['HADIR','TIDAK','IZIN','SAKIT'];

function likeParam(s){ return `%${String(s).replace(/[%_]/g,'')}%`; }
function validDate(d){ return /^\d{4}-\d{2}-\d{2}$/.test(String(d||'')) && !isNaN(new Date(d).getTime()); }
function haversine(lat1, lon1, lat2, lon2){
  const R=6371000;
  const toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
const GPS_RADIUS_M = 800; // toleransi TPS (meter)

router.get('/', async (req,res)=>{
  const t0=Date.now();
  const limit=Math.min(Math.max(parseInt(req.query.limit,10)||20,1),100);
  const offset=Math.max(parseInt(req.query.offset,10)||0,0);
  const saksiId=req.query.saksi_id||null;
  const tpsId=req.query.tps_id||null;
  const tanggal=req.query.tanggal||null;
  const status=(req.query.status||'').toUpperCase()||null;
  const search=req.query.search||null;
  try{
    const where=`(? IS NULL OR a.saksi_id=?) AND (? IS NULL OR a.tps_id=?) AND (? IS NULL OR a.tanggal=?) AND (? IS NULL OR a.status=?) AND (? IS NULL OR s.nama LIKE ? OR s.nik LIKE ? OR a.tps_id LIKE ?)`;
    const p=[saksiId,saksiId,tpsId,tpsId,tanggal,tanggal,status,status,search, search?likeParam(search):null, search?likeParam(search):null, search?likeParam(search):null];
    const [[c]]=await readPool.query(`SELECT COUNT(*) total FROM saksi_absensi a LEFT JOIN saksi s ON s.id=a.saksi_id WHERE ${where}`, p);
    const [rows]=await readPool.query(`SELECT a.*, s.nama, s.nik, s.no_hp, s.foto_ktp, s.bank, s.no_rekening, s.tps_id as saksi_tps, t.no_tps, d.nama desa, k.nama kecamatan, kb.nama kabupaten FROM saksi_absensi a LEFT JOIN saksi s ON s.id=a.saksi_id LEFT JOIN master_tps t ON t.id=a.tps_id LEFT JOIN desa d ON d.id=t.desa_id LEFT JOIN kecamatan k ON k.id=d.kecamatan_id LEFT JOIN kabupaten kb ON kb.id=k.kabupaten_id WHERE ${where} ORDER BY a.tanggal DESC, a.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
    res.json({success:true, elapsed_ms:Date.now()-t0, source:`Read-Replica (${readHost})`, total:Number(c.total||0), limit, offset, data:rows});
  }catch(err){ res.status(500).json({success:false, error:err.message}); }
});

router.post('/', requireAdmin, async (req,res)=>{
  const t0=Date.now();
  const saksiId=parseInt(req.body.saksi_id,10);
  const tanggal=req.body.tanggal ? String(req.body.tanggal).trim() : new Date().toISOString().slice(0,10);
  const status=String(req.body.status||'HADIR').trim().toUpperCase();
  const jam=req.body.jam_hadir ? String(req.body.jam_hadir).trim().slice(0,8) : null;
  const foto=req.body.foto_bukti ? String(req.body.foto_bukti).trim().slice(0,512) : null;
  const ket=req.body.keterangan ? String(req.body.keterangan).trim().slice(0,256) : null;
  let lat = req.body.lat!==undefined && req.body.lat!=='' && req.body.lat!==null ? Number(req.body.lat) : null;
  let lng = req.body.lng!==undefined && req.body.lng!=='' && req.body.lng!==null ? Number(req.body.lng) : null;
  if(!Number.isInteger(saksiId)) return res.status(400).json({success:false, error:'saksi_id wajib integer'});
  if(!validDate(tanggal)) return res.status(400).json({success:false, error:'tanggal YYYY-MM-DD'});
  if(!STAT.includes(status)) return res.status(400).json({success:false, error:'status harus '+STAT.join('/')});
  if(status==='HADIR'){
    if(!foto) return res.status(400).json({success:false, error:'foto_bukti wajib (ambil via kamera HP saksi)'});
    if(lat===null || lng===null || !Number.isFinite(lat)||!Number.isFinite(lng)) return res.status(400).json({success:false, error:'GPS lat/lng wajib (izin lokasi & ambil via kamera)'});
  }
  if(lat!==null && (!Number.isFinite(lat)||lat<-90||lat>90)) return res.status(400).json({success:false, error:'lat -90..90'});
  if(lng!==null && (!Number.isFinite(lng)||lng<-180||lng>180)) return res.status(400).json({success:false, error:'lng -180..180'});
  try{
    const [s]=await writePool.query('SELECT id, tps_id FROM saksi WHERE id=? LIMIT 1', [saksiId]);
    if(!s.length) return res.status(400).json({success:false, error:'saksi tidak ditemukan'});
    const tpsId=s[0].tps_id;
    // validasi GPS sesuai TPS
    let jarak=null, isValid=1;
    if(lat!==null && lng!==null){
      const [tpsRows]=await writePool.query('SELECT lat, lng FROM master_tps WHERE id=? LIMIT 1', [tpsId]);
      const tLat=tpsRows[0]?.lat, tLng=tpsRows[0]?.lng;
      if(tLat!==null && tLng!==null && Number.isFinite(Number(tLat)) && Number.isFinite(Number(tLng))){
        jarak=Math.round(haversine(lat,lng, Number(tLat), Number(tLng)));
        isValid= jarak<=GPS_RADIUS_M ? 1 : 0;
        if(!isValid) return res.status(400).json({success:false, error:`GPS di luar radius TPS (jarak ${jarak}m > ${GPS_RADIUS_M}m). Pastikan foto diambil di lokasi TPS ${tpsId}`});
      }
    }
    const [r]=await writePool.query('INSERT INTO saksi_absensi (saksi_id, tps_id, tanggal, status, jam_hadir, foto_bukti, lat, lng, jarak_meter, is_gps_valid, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [saksiId, tpsId, tanggal, status, jam, foto, lat, lng, jarak, isValid, ket]);
    const [rows]=await writePool.query('SELECT * FROM saksi_absensi WHERE id=?', [r.insertId]);
    res.status(201).json({success:true, elapsed_ms:Date.now()-t0, data:rows[0]});
  }catch(err){
    if(err.code==='ER_DUP_ENTRY') return res.status(409).json({success:false, error:'Absensi saksi tgl tsb sudah ada (unik saksi+tanggal)'});
    res.status(500).json({success:false, error:err.message});
  }
});

router.put('/:id', requireAdmin, async (req,res)=>{
  const sets=[], vals=[];
  if(req.body.tanggal!==undefined){
    const v=String(req.body.tanggal).trim();
    if(!validDate(v)) return res.status(400).json({success:false, error:'tanggal YYYY-MM-DD'});
    sets.push('tanggal=?'); vals.push(v);
  }
  if(req.body.status!==undefined){
    const v=String(req.body.status).trim().toUpperCase();
    if(!STAT.includes(v)) return res.status(400).json({success:false, error:'status '+STAT.join('/')});
    sets.push('status=?'); vals.push(v);
  }
  if(req.body.jam_hadir!==undefined){ sets.push('jam_hadir=?'); vals.push(req.body.jam_hadir? String(req.body.jam_hadir).trim().slice(0,8): null); }
  if(req.body.foto_bukti!==undefined){ sets.push('foto_bukti=?'); vals.push(req.body.foto_bukti? String(req.body.foto_bukti).trim().slice(0,512): null); }
  if(req.body.keterangan!==undefined){ sets.push('keterangan=?'); vals.push(req.body.keterangan? String(req.body.keterangan).trim().slice(0,256): null); }
  if(req.body.lat!==undefined || req.body.lng!==undefined){
    let lat=req.body.lat!==undefined? (req.body.lat===''||req.body.lat===null? null: Number(req.body.lat)) : undefined;
    let lng=req.body.lng!==undefined? (req.body.lng===''||req.body.lng===null? null: Number(req.body.lng)) : undefined;
    // jika salah satu di-update, ambos harus valid dan hitung jarak
    const [cur]=await writePool.query('SELECT lat, lng, tps_id FROM saksi_absensi WHERE id=? LIMIT 1', [req.params.id]);
    if(!cur.length) return res.status(404).json({success:false, error:'absensi tidak ditemukan'});
    let curLat=cur[0].lat, curLng=cur[0].lng;
    let newLat= lat!==undefined? lat : curLat, newLng= lng!==undefined? lng : curLng;
    if(newLat!==null && (!Number.isFinite(newLat)||newLat<-90||newLat>90)) return res.status(400).json({success:false, error:'lat -90..90'});
    if(newLng!==null && (!Number.isFinite(newLng)||newLng<-180||newLng>180)) return res.status(400).json({success:false, error:'lng -180..180'});
    let jarak=null, isValid=1;
    if(newLat!==null && newLng!==null){
      const [tpsRows]=await writePool.query('SELECT lat, lng FROM master_tps WHERE id=? LIMIT 1', [cur[0].tps_id]);
      const tLat=tpsRows[0]?.lat, tLng=tpsRows[0]?.lng;
      if(tLat!==null && tLng!==null && Number.isFinite(Number(tLat)) && Number.isFinite(Number(tLng))){
        jarak=Math.round(haversine(newLat,newLng, Number(tLat), Number(tLng)));
        isValid= jarak<=GPS_RADIUS_M ? 1 : 0;
        if(!isValid) return res.status(400).json({success:false, error:`GPS di luar radius TPS (jarak ${jarak}m > ${GPS_RADIUS_M}m)`});
      }
    }
    if(lat!==undefined){ sets.push('lat=?'); vals.push(newLat); }
    if(lng!==undefined){ sets.push('lng=?'); vals.push(newLng); }
    sets.push('jarak_meter=?'); vals.push(jarak);
    sets.push('is_gps_valid=?'); vals.push(isValid);
  }
  if(!sets.length) return res.status(400).json({success:false, error:'tidak ada field diubah'});
  try{
    const [r]=await writePool.query(`UPDATE saksi_absensi SET ${sets.join(', ')} WHERE id=?`, [...vals, req.params.id]);
    if(!r.affectedRows) return res.status(404).json({success:false, error:'absensi tidak ditemukan'});
    const [rows]=await writePool.query('SELECT * FROM saksi_absensi WHERE id=?', [req.params.id]);
    res.json({success:true, elapsed_ms:Date.now()-0, data:rows[0]});
  }catch(err){
    if(err.code==='ER_DUP_ENTRY') return res.status(409).json({success:false, error:'Duplikat saksi+tanggal'});
    res.status(500).json({success:false, error:err.message});
  }
});

router.delete('/:id', requireAdmin, async (req,res)=>{
  try{
    const [rows]=await writePool.query('SELECT * FROM saksi_absensi WHERE id=? LIMIT 1', [req.params.id]);
    if(!rows.length) return res.status(404).json({success:false, error:'absensi tidak ditemukan'});
    await writePool.query('DELETE FROM saksi_absensi WHERE id=?', [req.params.id]);
    res.json({success:true, data:rows[0]});
  }catch(err){ res.status(500).json({success:false, error:err.message}); }
});

module.exports=router;
