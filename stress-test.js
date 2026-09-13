/**
 * ============================================================================
 * [Issue #09 & #11] Local Stress Test Runner (Native Node.js)
 * Menguji tembakan throughput ke API http://localhost:3000/api/c1/submit
 * Mengukur latency p50, p95, throughput (req/s), dan error rate.
 * ============================================================================
 */
const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 3000;
const DURATION_SECONDS = 10;
const CONCURRENCY = 50;

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: CONCURRENCY * 2
});

let totalRequests = 0;
let successRequests = 0;
let failedRequests = 0;
const latencies = [];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePayload() {
  const tpsNumber = String(randomInt(1, 29000)).padStart(5, '0');
  const tpsId = `3273011${tpsNumber}`;
  const dice = Math.random();

  if (dice < 0.5) {
    const p1 = randomInt(60, 160);
    const p2 = randomInt(50, 140);
    return {
      tps_id: tpsId,
      kategori_pemilihan_id: 'PILKADA_KOTA_BDG',
      image_key: `c1/sim/pilkada-${tpsId}.jpg`,
      suara_sah: p1 + p2,
      suara_tidak_sah: randomInt(1, 8),
      detail_suara: [
        { kandidat_id: 'PASLON_1', jumlah_suara: p1 },
        { kandidat_id: 'PASLON_2', jumlah_suara: p2 }
      ]
    };
  } else {
    const detail = [];
    let sah = 0;
    for (let i = 1; i <= 20; i++) {
      const v = randomInt(0, 35);
      detail.push({ kandidat_id: `CALEG_DAPIL1_${i}`, jumlah_suara: v });
      sah += v;
    }
    return {
      tps_id: tpsId,
      kategori_pemilihan_id: 'PILEG_DPR_RI_DAPIL1',
      image_key: `c1/sim/pileg-${tpsId}.jpg`,
      suara_sah: sah,
      suara_tidak_sah: randomInt(0, 15),
      detail_suara: detail
    };
  }
}

function sendOne() {
  return new Promise((resolve) => {
    const postData = JSON.stringify(generatePayload());
    const t0 = Date.now();

    const req = http.request({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/c1/submit',
      method: 'POST',
      agent: agent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        const elapsed = Date.now() - t0;
        latencies.push(elapsed);
        totalRequests++;
        if (res.statusCode === 200) {
          successRequests++;
        } else {
          failedRequests++;
        }
        resolve();
      });
    });

    req.on('error', () => {
      failedRequests++;
      totalRequests++;
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

async function workerLoop(endTime) {
  while (Date.now() < endTime) {
    await sendOne();
  }
}

async function run() {
  console.log('===============================================================');
  console.log(`[STRESS TEST] Target: http://${API_HOST}:${API_PORT}/api/c1/submit`);
  console.log(`[STRESS TEST] Concurrency: ${CONCURRENCY} connections | Durasi: ${DURATION_SECONDS} detik`);
  console.log('===============================================================');

  const startTime = Date.now();
  const endTime = startTime + (DURATION_SECONDS * 1000);

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(workerLoop(endTime));
  }

  await Promise.all(workers);
  const totalElapsedSec = (Date.now() - startTime) / 1000;

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const rps = (successRequests / totalElapsedSec).toFixed(1);

  console.log('\n--- HASIL PENGUJIAN ---');
  console.log(`Total Request    : ${totalRequests}`);
  console.log(`Sukses (HTTP 200): ${successRequests}`);
  console.log(`Gagal / Error    : ${failedRequests}`);
  console.log(`Throughput       : ${rps} req/detik`);
  console.log(`Latency p50      : ${p50} ms`);
  console.log(`Latency p95      : ${p95} ms (Target SLA: < 100ms)`);
  console.log(`Latency p99      : ${p99} ms`);
  console.log('---------------------------------------------------------------');
  console.log(p95 < 100 ? '✅ SLA TERPENUHI: p95 < 100ms' : '⚠️ SLA BELUM TERPENUHI');
}

run().catch(console.error);
