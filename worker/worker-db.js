const { Worker, Queue } = require('bullmq');
const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
  namedPlaceholders: false
});

// buffer berisi { job, resolve, reject } — job HANYA di-ack oleh BullMQ
// setelah barisnya benar-benar tertulis ke MySQL (resolve), atau ditolak saat
// insert gagal permanen (reject -> BullMQ akan me-retry sesuai `attempts`).
let buffer = [];
let lastFlushAt = Date.now();
let totalInserted = 0;
let flushRunning = null;

const TX_COLS = 'id,tps_id,kategori_pemilihan_id,jumlah_dpt,jumlah_hadir,jumlah_surat_suara,surat_baik,surat_rusak,surat_cadangan,total_suara_sah,total_suara_tidak_sah,image_url,image_urls,status_ocr';
const DET_COLS = 'transaksi_c1_id,kandidat_id,jumlah_suara';

function imageUrl(key) {
  return `${config.s3.publicEndpoint}/${config.s3.bucket}/${encodeURIComponent(key)}`;
}

async function insertBatch(batch) {
  const txRows = [];
  const detailRows = [];
  let totalSuara = 0;

  for (const job of batch) {
    const d = job.data;
    const id = randomUUID();
    const urls = (d.image_keys && d.image_keys.length ? d.image_keys : (d.image_key ? [d.image_key] : [])).map(k=>imageUrl(k));
    const firstUrl = urls[0] || imageUrl(d.image_key);
    txRows.push([
      id,
      d.tps_id,
      d.kategori_pemilihan_id,
      d.jumlah_dpt ?? null,
      d.jumlah_hadir ?? null,
      d.jumlah_surat_suara ?? null,
      d.surat_baik ?? null,
      d.surat_rusak ?? null,
      d.surat_cadangan ?? null,
      d.suara_sah,
      d.suara_tidak_sah,
      firstUrl,
      urls.length ? JSON.stringify(urls) : null,
      0
    ]);
    for (const s of d.detail_suara || []) {
      detailRows.push([id, s.kandidat_id, s.jumlah_suara]);
      totalSuara += s.jumlah_suara || 0;
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`INSERT INTO transaksi_c1 (${TX_COLS}) VALUES ?`, [txRows]);
    if (detailRows.length > 0) {
      await conn.query(`INSERT INTO detail_suara (${DET_COLS}) VALUES ?`, [detailRows]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return totalSuara;
}

async function flush() {
  if (buffer.length === 0) return 0;
  if (flushRunning) return flushRunning;
  const items = buffer.splice(0, buffer.length);
  flushRunning = doFlush(items).finally(() => { flushRunning = null; });
  return flushRunning;
}

async function doFlush(items) {
  const t0 = Date.now();
  const jobs = items.map((it) => it.job);
  try {
    const totalSuara = await insertBatch(jobs);
    totalInserted += items.length;
    items.forEach((it) => it.resolve());
    console.log(
      `[FLUSH] BATCH INSERT ${items.length} transaksi + ${detailCount(jobs)} detail suara` +
      ` (${totalSuara} suara) | durasi ${Date.now() - t0}ms | total ${totalInserted}`
    );
    return items.length;
  } catch (err) {
    console.error(`[FLUSH] GAGAL batch (${items.length}):`, err.message);
    console.error('[FLUSH] Isolasi per-job agar satu job buruk tidak menggagalkan seluruh batch...');
    let ok = 0;
    for (const it of items) {
      try {
        await insertBatch([it.job]);
        totalInserted += 1;
        ok += 1;
        it.resolve();
      } catch (e2) {
        // Job benar-benar akan ditolak -> masukkan kembali ke antrean utk retry
        console.error(`[FLUSH] JOB ${it.job.id} POISON/tidak tertulis ke DB:`, e2.message);
        it.reject(e2);
      }
    }
    console.log(`[FLUSH] Isolasi selesai: ${ok}/${items.length} terselamatkan, sisanya diretry oleh BullMQ`);
    return 0;
  } finally {
    lastFlushAt = Date.now();
  }
}

function detailCount(batch) {
  return batch.reduce((acc, j) => acc + (j.data.detail_suara || []).length, 0);
}

const worker = new Worker(config.queueName, async (job) => {
  // Return Promise yang HANYA resolve setelah flush() berhasil tertulis ke DB
  return new Promise((resolve, reject) => {
    buffer.push({ job, resolve, reject });
    if (buffer.length >= config.batchSize) flush();
  });
}, {
  connection: config.redis,
  concurrency: 1,
  prefix: 'bull',
  // BullMQ retries otomatis jika processor reject (poison job)
  // Job bertahan sebagai "active" di Redis sampai flush+resolve -> tidak ada data loss
  lockDuration: 60000,
  stalledInterval: 30000
});

worker.on('completed', (job) => {
  console.log(`[DONE] job ${job.id} TERTULIS ke MySQL`);
});
worker.on('failed', (job, err) => {
  console.error(`[FAIL] job ${job.id} gagal setelah retries:`, err.message);
});
worker.on('error', (err) => {
  console.error('[worker] error:', err.message);
});

const flushTimer = setInterval(async () => {
  if (buffer.length > 0 && (Date.now() - lastFlushAt) >= config.flushIntervalMs) {
    // Drain sisa buffer dalam chunks sebesar batchSize
    while (buffer.length > 0 && !flushRunning) {
      await flush();
    }
  }
}, 200);

const queue = new Queue(config.queueName, {
  connection: config.redis,
  prefix: 'bull'
});

const statsTimer = setInterval(async () => {
  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    console.log('[QUEUE]', JSON.stringify(counts));
  } catch (err) {
    console.error('[stats] error:', err.message);
  }
}, 5000);

console.log(`[worker] BullMQ consumer siap: queue=${config.queueName} | batch=${config.batchSize} | flush=${config.flushIntervalMs}ms`);

async function shutdown() {
  console.log('\n[worker] Menjalankan drain buffer sebelum shutdown...');
  clearInterval(flushTimer);
  clearInterval(statsTimer);
  await flush();
  await worker.close();
  await queue.close();
  await pool.end();
  console.log(`[worker] Selesai. Total ${totalInserted} transaksi ditulis ke MySQL.`);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);