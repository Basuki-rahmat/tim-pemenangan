const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const config = require('./config');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null
};

const c1Queue = new Queue('c1-queue', { connection });

// Koneksi Redis terpisah khusus idempotency (SET NX EX) agar tidak mengganggu
// pipeline internal BullMQ. Dipakai GET/POST /api/c1/submit untuk menolak
// duplikat pengiriman pada tps_id + kategori_pemilihan_id yang sama.
const dedupeClient = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: 3
});

// Jendela dedupe 24 jam: cukup untuk sesi hari pencoblosan, mencegah spam ulang.
const DEDUPE_TTL_SECONDS = 24 * 60 * 60;

// true = sudah dikirim sebelumnya (duplikat); false = sukses mengunci untuk pertama kali.
async function isDuplicateSubmit(tpsId, kategoriId, idempotencyKey) {
  const key = `c1:ddupe:${idempotencyKey || `${tpsId}:${kategoriId}`}`;
  const res = await dedupeClient.set(key, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
  return res === null;
}

module.exports = { c1Queue, isDuplicateSubmit };