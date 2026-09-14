const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const { ensureBucket } = require('./s3');
const { c1Queue } = require('./queue');
const c1Router = require('./routes/c1');
const wilayahRouter = require('./routes/wilayah');
const authRouter = require('./routes/auth');
const kandidatRouter = require('./routes/kandidat');
const adminRouter = require('./routes/admin');
const dapilRouter = require('./routes/dapil');
const tpsRouter = require('./routes/tps');
const saksiRouter = require('./routes/saksi');
const absensiRouter = require('./routes/absensi');
const danaRouter = require('./routes/dana');
const { readPool } = require('./db');

const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

app.use('/api/c1', c1Router);
app.use('/api/wilayah', wilayahRouter);
app.use('/api/auth', authRouter);
app.use('/api/kandidat', kandidatRouter);
app.use('/api/admin', adminRouter);
app.use('/api/dapil', dapilRouter);
app.use('/api/tps', tpsRouter);
app.use('/api/saksi', saksiRouter);
app.use('/api/absensi', absensiRouter);
app.use('/api/dana', danaRouter);

const frontendDir = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir));

// Kartu Saksi shareable dengan OG thumbnail (untuk preview WA)
// URL: /kartu/:id  contoh: /kartu/12  -> tampilkan kartu + OG kandidat foto + link login
app.get('/kartu/:id', async (req, res) => {
  try {
    const id = String(req.params.id).trim();
    const [rows] = await readPool.query(`
      SELECT s.id, s.nama, s.nik, s.username, s.tps_id, s.kandidat_id, s.bank, k.nama AS kandidat_nama, k.foto AS kandidat_foto, k.partai, t.no_tps, d.nama AS desa, kec.nama AS kecamatan, kab.nama AS kabupaten
      FROM saksi s
      LEFT JOIN master_kandidat k ON k.id = s.kandidat_id
      LEFT JOIN master_tps t ON t.id = s.tps_id
      LEFT JOIN desa d ON d.id = t.desa_id
      LEFT JOIN kecamatan kec ON kec.id = d.kecamatan_id
      LEFT JOIN kabupaten kab ON kab.id = kec.kabupaten_id
      WHERE s.id = ? OR s.username = ? LIMIT 1
    `, [id, id]);
    if (!rows.length) return res.status(404).send('<h1>Kartu saksi tidak ditemukan</h1>');
    const s = rows[0];
    const origin = `${req.protocol}://${req.get('host')}`;
    const loginUrl = `${origin}/saksi.html?u=${encodeURIComponent(s.username || s.nik)}`;
    const kandidatFoto = s.kandidat_foto && s.kandidat_foto.startsWith('http') ? s.kandidat_foto : null;
    const ogImage = kandidatFoto || `https://via.placeholder.com/1200x630.png?text=${encodeURIComponent((s.kandidat_nama||'Tim Pemenangan') + ' - ' + s.nama)}`;
    const title = `Kartu Saksi • ${s.nama} — TPS ${s.no_tps || s.tps_id}`;
    const desc = `TPS ${s.no_tps||''} ${s.desa||''}/${s.kecamatan||''} • Kandidat ${s.kandidat_nama||'-'} (${s.partai||'-'}) • Login: ${s.username} • ${origin}/saksi.html`;
    // simple HTML dengan OG + card + tombol login
    res.send(`<!doctype html><html lang="id"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/</g,'&lt;')}</title>
<meta property="og:title" content="${title.replace(/"/g,'&quot;')}" />
<meta property="og:description" content="${desc.replace(/"/g,'&quot;')}" />
<meta property="og:image" content="${ogImage.replace(/"/g,'&quot;')}" />
<meta property="og:url" content="${origin}/kartu/${encodeURIComponent(String(s.id))}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${ogImage.replace(/"/g,'&quot;')}" />
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,Segoe UI,system-ui,sans-serif;background:#f1f5f9;color:#0f172a;padding:16px;}
  .card{max-width:520px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);}
  .hero{height:8px;background:linear-gradient(90deg,#d40511,#f97316);}
  .head{padding:16px;display:flex;gap:14px;align-items:center;}
  .foto{width:84px;height:84px;border-radius:14px;object-fit:cover;border:1px solid #e2e8f0;background:#f8fafc;flex-shrink:0;}
  .foto.plain{width:84px;height:84px;border-radius:14px;background:linear-gradient(135deg,#f8fafc,#eef2f7);display:grid;place-items:center;font-size:28px;color:#94a3b8;}
  .info{flex:1;min-width:0;}
  .nama{font-size:16px;font-weight:900;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .sub{font-size:12px;color:#64748b;font-weight:600;margin-top:2px;}
  .badge{display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:3px 8px;font-size:10.5px;font-weight:750;margin-top:6px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px 16px;}
  .box{border:1px solid #e2e8f0;border-radius:11px;padding:10px;background:#f8fafc;}
  .box b{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;display:block;margin-bottom:4px;}
  .box span{font-size:13px;font-weight:700;word-break:break-all;}
  .box span.mono{font-family:monospace;font-size:12px;}
  .cta{padding:16px;display:flex;gap:10px;flex-wrap:wrap;}
  .btn{flex:1;border-radius:11px;padding:11px 14px;font-weight:800;font-size:13px;border:1px solid transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;}
  .btn-p{background:linear-gradient(135deg,#d40511,#b91c1c);color:#fff;box-shadow:0 8px 20px rgba(212,5,17,.22);}
  .btn-g{background:#fff;color:#0f172a;border-color:#e2e8f0;}
  .foot{padding:12px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center;}
</style>
</head><body>
<div class="card">
  <div class="hero"></div>
  <div class="head">
    ${kandidatFoto ? `<img class="foto" src="${ogImage.replace(/"/g,'&quot;')}" alt="kandidat" />` : `<div class="foto plain">🗳️</div>`}
    <div class="info">
      <div class="nama">${String(s.nama).replace(/</g,'&lt;')}</div>
      <div class="sub">TPS ${String(s.no_tps||s.tps_id).replace(/</g,'&lt;')} • ${String(s.desa||'-').replace(/</g,'&lt;')} / ${String(s.kecamatan||'-').replace(/</g,'&lt;')}</div>
      <div class="badge">Kandidat: ${String(s.kandidat_nama||'-').replace(/</g,'&lt;')} ${s.partai?`(${String(s.partai).replace(/</g,'&lt;')})`:''}</div>
    </div>
  </div>
  <div class="grid">
    <div class="box"><b>Username</b><span class="mono">${String(s.username||'-').replace(/</g,'&lt;')}</span></div>
    <div class="box"><b>User ID</b><span class="mono">#${String(s.id).replace(/</g,'&lt;')}</span></div>
    <div class="box"><b>Password</b><span style="color:#b91c1c;">(lihat di WA admin)</span></div>
    <div class="box"><b>${s.bank? String(s.bank).replace(/</g,'&lt;') : 'Bank'} Rekening</b><span class="mono">${s.bank? String(s.bank).replace(/</g,'&lt;')+' • ' : ''}${String(s.tps_id).replace(/</g,'&lt;')}</span></div>
  </div>
  <div class="cta">
    <a class="btn btn-p" href="${loginUrl}">🔐 Login Saksi</a>
    <a class="btn btn-g" href="${origin}/saksi.html">📱 Buka Dashboard</a>
  </div>
  <div class="foot">Kartu ini memiliki pratinjau OG dengan foto kandidat <b>${String(s.kandidat_nama||'Tim Pemenangan').replace(/</g,'&lt;')}</b> untuk thumbnail WA. Bagikan link ini — penerima WA akan melihat thumbnail foto kandidat.</div>
</div>
<p style="text-align:center; font-size:11px; color:#94a3b8; margin-top:12px;">Tim Pemenangan • Rekapitulasi Form C1 • 29.000 TPS</p>
</body></html>`);
  } catch (e) {
    res.status(500).send('Gagal load kartu: '+ e.message);
  }
});

app.get('/', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

app.use((err, req, res, next) => {
  console.error('[api] error:', err);
  res.status(500).json({ success: false, error: err.message });
});

async function main() {
  await ensureBucket();
  const server = app.listen(config.port, () => {
    console.log(`[api] Producer siap di http://localhost:${config.port}`);
    console.log(`[api] Redis queue : ${config.redis.host}:${config.redis.port} (c1-queue)`);
    console.log(`[api] S3 endpoint : ${config.s3.endpoint}`);
  });

  const shutdown = async () => {
    console.log('\n[api] Mematikan service...');
    await c1Queue.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[api] Gagal startup:', err);
  process.exit(1);
});