/**
 * CRUD Dana Saksi (Admin)
 *  GET    /api/dana[?saksi_id=&tps_id=&status=&search=&limit=&offset=]
 *  POST   /api/dana  { saksi_id, nominal, bank?, no_rekening?, status?, tanggal_cair?, bukti_tf?, keterangan? }
 *  PUT    /api/dana/:id { ... }
 *  DELETE /api/dana/:id
 */
const { Router } = require('express');
const { readPool, readHost, writePool } = require('../db');
const { requireAdmin } = require('../auth');
const router = Router();
const STAT=['PENDING','PROSES','CAIR','BATAL'];

function likeParam(s){ return `%${String(s).replace(/[%_]/g,'')}%`; }
function validDate(d){ return !d || (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) && !isNaN(new Date(d).getTime())); }

router.get('/', async (req,res)=>{
  const t0=Date.now();
  const limit=Math.min(Math.max(parseInt(req.query.limit,10)||20,1),100);
  const offset=Math.max(parseInt(req.query.offset,10)||0,0);
  const saksiId=req.query.saksi_id||null;
  const tpsId=req.query.tps_id||null;
  const status=(req.query.status||'').toUpperCase()||null;
  const search=req.query.search||null;
  try{
    const where=`(? IS NULL OR d.saksi_id=?) AND (? IS NULL OR d.tps_id=?) AND (? IS NULL OR d.status=?) AND (? IS NULL OR s.nama LIKE ? OR s.nik LIKE ? OR s.bank LIKE ?)`;
    const p=[saksiId,saksiId,tpsId,tpsId,status,status,search, search?likeParam(search):null, search?likeParam(search):null, search?likeParam(search):null];
    const [[c]]=await readPool.query(`SELECT COUNT(*) total FROM saksi_dana d LEFT JOIN saksi s ON s.id=d.saksi_id WHERE ${where}`, p);
    const [rows]=await readPool.query(`SELECT d.*, s.nama, s.nik, s.no_hp, s.bank as saksi_bank, s.no_rekening as saksi_rek, s.foto_ktp, t.no_tps, de.nama desa, k.nama kecamatan, kb.nama kabupaten FROM saksi_dana d LEFT JOIN saksi s ON s.id=d.saksi_id LEFT JOIN master_tps t ON t.id=d.tps_id LEFT JOIN desa de ON de.id=t.desa_id LEFT JOIN kecamatan k ON k.id=de.kecamatan_id LEFT JOIN kabupaten kb ON kb.id=k.kabupaten_id WHERE ${where} ORDER BY d.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
    const [[sum]]=await readPool.query(`SELECT COALESCE(SUM(CASE WHEN status='CAIR' THEN nominal ELSE 0 END),0) as cair, COALESCE(SUM(CASE WHEN status!='BATAL' THEN nominal ELSE 0 END),0) as total, COUNT(*) as jml FROM saksi_dana d LEFT JOIN saksi s ON s.id=d.saksi_id WHERE ${where}`, p);
    res.json({success:true, elapsed_ms:Date.now()-t0, source:`Read-Replica (${readHost})`, total:Number(c.total||0), summary:{ total: Number(sum.total||0), cair:Number(sum.cair||0), jml:Number(sum.jml||0)}, limit, offset, data:rows});
  }catch(err){ res.status(500).json({success:false, error:err.message}); }
});

router.post('/', requireAdmin, async (req,res)=>{
  const t0=Date.now();
  const saksiId=parseInt(req.body.saksi_id,10);
  const nominal=parseInt(req.body.nominal,10);
  const bank=req.body.bank? String(req.body.bank).trim().toUpperCase().slice(0,32) : null;
  const norek=req.body.no_rekening? String(req.body.no_rekening).trim().slice(0,64) : null;
  const status=String(req.body.status||'PENDING').trim().toUpperCase();
  const tgl=req.body.tanggal_cair? String(req.body.tanggal_cair).trim().slice(0,10) : null;
  const bukti=req.body.bukti_tf? String(req.body.bukti_tf).trim().slice(0,512) : null;
  const ket=req.body.keterangan? String(req.body.keterangan).trim().slice(0,256) : null;
  if(!Number.isInteger(saksiId)) return res.status(400).json({success:false, error:'saksi_id wajib'});
  if(!Number.isInteger(nominal) || nominal<=0) return res.status(400).json({success:false, error:'nominal wajib >0'});
  if(!STAT.includes(status)) return res.status(400).json({success:false, error:'status '+STAT.join('/')});
  if(tgl && !validDate(tgl)) return res.status(400).json({success:false, error:'tanggal_cair YYYY-MM-DD'});
  try{
    const [s]=await writePool.query('SELECT id, tps_id, bank, no_rekening FROM saksi WHERE id=?', [saksiId]);
    if(!s.length) return res.status(400).json({success:false, error:'saksi tidak ditemukan'});
    const tpsId=s[0].tps_id;
    const finalBank=bank || s[0].bank;
    const finalRek=norek || s[0].no_rekening;
    const [r]=await writePool.query('INSERT INTO saksi_dana (saksi_id, tps_id, nominal, bank, no_rekening, status, tanggal_cair, bukti_tf, keterangan) VALUES (?,?,?,?,?,?,?,?,?)', [saksiId, tpsId, nominal, finalBank, finalRek, status, tgl, bukti, ket]);
    const [rows]=await writePool.query('SELECT * FROM saksi_dana WHERE id=?', [r.insertId]);
    res.status(201).json({success:true, elapsed_ms:Date.now()-t0, data:rows[0]});
  }catch(err){ res.status(500).json({success:false, error:err.message}); }
});

router.put('/:id', requireAdmin, async (req,res)=>{
  const sets=[], vals=[];
  if(req.body.nominal!==undefined){ const n=parseInt(req.body.nominal,10); if(!Number.isInteger(n)||n<=0) return res.status(400).json({success:false,error:'nominal >0'}); sets.push('nominal=?'); vals.push(n); }
  if(req.body.bank!==undefined){ sets.push('bank=?'); vals.push(req.body.bank? String(req.body.bank).trim().toUpperCase().slice(0,32): null); }
  if(req.body.no_rekening!==undefined){ sets.push('no_rekening=?'); vals.push(req.body.no_rekening? String(req.body.no_rekening).trim().slice(0,64): null); }
  if(req.body.status!==undefined){ const v=String(req.body.status).trim().toUpperCase(); if(!STAT.includes(v)) return res.status(400).json({success:false,error:'status '+STAT.join('/')}); sets.push('status=?'); vals.push(v); }
  if(req.body.tanggal_cair!==undefined){ const v=req.body.tanggal_cair? String(req.body.tanggal_cair).trim().slice(0,10): null; if(v && !validDate(v)) return res.status(400).json({success:false,error:'tanggal YYYY-MM-DD'}); sets.push('tanggal_cair=?'); vals.push(v); }
  if(req.body.bukti_tf!==undefined){ sets.push('bukti_tf=?'); vals.push(req.body.bukti_tf? String(req.body.bukti_tf).trim().slice(0,512): null); }
  if(req.body.keterangan!==undefined){ sets.push('keterangan=?'); vals.push(req.body.keterangan? String(req.body.keterangan).trim().slice(0,256): null); }
  if(!sets.length) return res.status(400).json({success:false,error:'tidak ada field diubah'});
  try{
    const [r]=await writePool.query(`UPDATE saksi_dana SET ${sets.join(', ')} WHERE id=?`, [...vals, req.params.id]);
    if(!r.affectedRows) return res.status(404).json({success:false,error:'dana tidak ditemukan'});
    const [rows]=await writePool.query('SELECT * FROM saksi_dana WHERE id=?', [req.params.id]);
    res.json({success:true, data:rows[0]});
  }catch(err){ res.status(500).json({success:false,error:err.message}); }
});

router.delete('/:id', requireAdmin, async (req,res)=>{
  try{
    const [rows]=await writePool.query('SELECT * FROM saksi_dana WHERE id=? LIMIT 1', [req.params.id]);
    if(!rows.length) return res.status(404).json({success:false,error:'dana tidak ditemukan'});
    await writePool.query('DELETE FROM saksi_dana WHERE id=?', [req.params.id]);
    res.json({success:true, data:rows[0]});
  }catch(err){ res.status(500).json({success:false,error:err.message}); }
});

module.exports=router;
