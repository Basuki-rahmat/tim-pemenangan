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

let buffer = [];
let lastFlushAt = Date.now();
let totalInserted = 0;

const TX_COLS = 'id,tps_id,kategori_pemilihan_id,jumlah_dpt,jumlah_hadir,total_suara_sah,total_suara_tidak_sah,image_url,status_ocr';
const DET_COLS = 'transaksi_c1_id,kandidat_id,jumlah_suara';

function imageUrl(key) {
  return `${config.s3.endpoint}/${config.s3.bucket}/${encodeURIComponent(key)}`;
}

async function insertBatch(batch) {
  const txRows = [];
  const detailRows = [];
  let totalSuara = 0;

  for (const job of batch) {
    const d = job.data;
    const id = randomUUID();
    txRows.push([
      id,
      d.tps_id,
      d.kategori_pemilihan_id,
      d.jumlah_dpt ?? null,
      d.jumlah_hadir ?? null,
      d.suara_sah,
      d.suara_tidak_sah,
      imageUrl(d.image_key),
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
  const batch = buffer.splice(0, buffer.length);
  const t0 = Date.now();
  try {
    const totalSuara = await insertBatch(batch);
    totalInserted += batch.length;
    console.log(
      `[FLUSH] BATCH INSERT ${batch.length} transaksi + ${detailCount(batch)} detail suara` +
      ` | durasi ${Date.now() - t0}ms | total ${totalInserted}`
    );
    return batch.length;
  } catch (err) {
    console.error('[FLUSH] GAGAL batch insert:', err.message);
    buffer.unshift(...batch);
    return 0;
  } finally {
    lastFlushAt = Date.now();
  }
}

function detailCount(batch) {
  return batch.reduce((acc, j) => acc + (j.data.detail_suara || []).length, 0);
}

const worker = new Worker(config.queueName, async (job) => {
  buffer.push(job);
  if (buffer.length >= config.batchSize) {
    await flush();
  }
}, {
  connection: config.redis,
  concurrency: 1,
  prefix: 'bull'
});

worker.on('completed', (job) => {
  if (job.returnvalue !== undefined) console.log(`[DONE] job ${job.id} diproses`);
});
worker.on('failed', (job, err) => {
  console.error(`[FAIL] job ${job.id} gagal:`, err.message);
});
worker.on('error', (err) => {
  console.error('[worker] error:', err.message);
});

const flushTimer = setInterval(async () => {
  if (buffer.length > 0 && (Date.now() - lastFlushAt) >= config.flushIntervalMs) {
    await flush();
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