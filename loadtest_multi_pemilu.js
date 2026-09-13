/**
 * ============================================================================
 * [Issue #09] Pengujian Beban Ekstrem Multi-Pemilu (k6 Script)
 * Menyimulasikan lonjakan data campuran (Pilkada, Pilbup, Pileg) hingga
 * ribuan request per detik secara konkuren.
 * 
 * Jalankan via k6:
 *   k6 run loadtest_multi_pemilu.js
 *   k6 run --vus 100 --duration 30s loadtest_multi_pemilu.js
 * ============================================================================
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Metrik kustom SLA
export const errorRate = new Rate('c1_error_rate');
export const submitLatency = new Trend('c1_submit_duration_ms', true);
export const totalSuaraCounter = new Counter('c1_total_suara_submitted');

export const options = {
  scenarios: {
    // Skenario lonjakan bertahap (Ramping VUs)
    c1_peak_traffic: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '10s', target: 50 },   // Pemanasan
        { duration: '20s', target: 200 },  // Lonjakan beban puncak
        { duration: '10s', target: 200 },  // Bertahan di beban puncak
        { duration: '10s', target: 0 }     // Penurunan
      ],
      gracefulRampDown: '5s'
    }
  },
  thresholds: {
    // SLA Issue #09: 95% request submit harus selesai < 100ms
    http_req_duration: ['p(95)<100'],
    c1_submit_duration_ms: ['p(95)<100'],
    c1_error_rate: ['rate<0.01'] // Error rate < 1%
  }
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePayload() {
  const tpsNumber = String(randomInt(1, 29000)).padStart(5, '0');
  const tpsId = `3273011${tpsNumber}`;
  const dice = Math.random();

  if (dice < 0.45) {
    // 1. Kategori Pilkada Kota Bandung (Sedikit Paslon: 2 - 4 paslon)
    const paslon1 = randomInt(50, 180);
    const paslon2 = randomInt(40, 160);
    const sah = paslon1 + paslon2;
    const tidakSah = randomInt(0, 15);
    return {
      tps_id: tpsId,
      kategori_pemilihan_id: 'PILKADA_KOTA_BDG',
      image_key: `c1/sim/pilkada-${tpsId}.jpg`,
      suara_sah: sah,
      suara_tidak_sah: tidakSah,
      detail_suara: [
        { kandidat_id: 'PASLON_1', jumlah_suara: paslon1 },
        { kandidat_id: 'PASLON_2', jumlah_suara: paslon2 }
      ]
    };
  } else if (dice < 0.8) {
    // 2. Kategori Pileg DPR RI (Banyak Kandidat: 10 partai + 20-30 caleg)
    const detail = [];
    let totalSah = 0;
    const jumlahKandidat = randomInt(15, 30);
    for (let i = 1; i <= jumlahKandidat; i++) {
      const suara = randomInt(0, 45);
      detail.push({
        kandidat_id: `CALEG_DAPIL1_${i}`,
        jumlah_suara: suara
      });
      totalSah += suara;
    }
    return {
      tps_id: tpsId,
      kategori_pemilihan_id: 'PILEG_DPR_RI_DAPIL1',
      image_key: `c1/sim/pileg-${tpsId}.jpg`,
      suara_sah: totalSah,
      suara_tidak_sah: randomInt(0, 20),
      detail_suara: detail
    };
  } else {
    // 3. Kategori DPD RI (Foto Calon Perseorangan: ~12 calon)
    const detail = [];
    let totalSah = 0;
    for (let i = 1; i <= 12; i++) {
      const suara = randomInt(5, 40);
      detail.push({
        kandidat_id: `DPD_JABAR_${i}`,
        jumlah_suara: suara
      });
      totalSah += suara;
    }
    return {
      tps_id: tpsId,
      kategori_pemilihan_id: 'DPD_RI_JABAR',
      image_key: `c1/sim/dpd-${tpsId}.jpg`,
      suara_sah: totalSah,
      suara_tidak_sah: randomInt(0, 10),
      detail_suara: detail
    };
  }
}

export default function () {
  const payload = JSON.stringify(generatePayload());
  const params = {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: '5s'
  };

  const t0 = Date.now();
  const res = http.post(`${BASE_URL}/api/c1/submit`, payload, params);
  const elapsed = Date.now() - t0;
  submitLatency.add(elapsed);

  const isOk = check(res, {
    'status is 200': (r) => r.status === 200,
    'success true': (r) => {
      try {
        return JSON.parse(r.body).success === true;
      } catch (_) {
        return false;
      }
    },
    'response under 100ms': () => elapsed < 100
  });

  if (!isOk) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
    totalSuaraCounter.add(1);
  }

  // Pacing jeda mikro antar request (menyerupai kedatangan saksi acak)
  sleep(0.01);
}
