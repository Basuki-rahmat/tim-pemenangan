// End-to-End Test: Presigned URL -> PUT ke MinIO -> POST /api/c1/submit -> Redis Queue
// Jalankan: node e2e-test.js [--api=http://localhost:3000]
const API = process.argv.find(a => a.startsWith('--api='))?.split('=')[1] || 'http://localhost:3000';

async function main() {
  console.log('== E2E TEST FORM C1 ==================================');

  console.log('\n[1] Minta Presigned URL (GET /api/c1/upload-request)');
  const upRes = await fetch(`${API}/api/c1/upload-request?filename=c1-demo.jpg&content_type=image/jpeg`);
  const up = await upRes.json();
  if (!up.success) throw new Error('Gagal upload-request: ' + up.error);
  console.log(`    OK (${up.elapsed_ms}ms) | key=${up.image_key}`);

  console.log('\n[2] Upload gambar langsung ke MinIO / S3 (PUT)');
  const imageBuf = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ff8f0c770000000049454e44ae426082',
    'hex'
  );
  const put = await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': up.content_type },
    body: imageBuf
  });
  if (!put.ok) throw new Error(`Upload S3 gagal (HTTP ${put.status})`);
  console.log('    OK | image langsung di object storage');

  console.log('\n[3] Kirim metadata suara (POST /api/c1/submit)');
  const payload = {
    tps_id: '3273011001001',
    kategori_pemilihan_id: 'PILKADA_KOTA_BDG',
    image_key: up.image_key,
    suara_sah: 200,
    suara_tidak_sah: 5,
    detail_suara: [
      { kandidat_id: 'PASLON_1', jumlah_suara: 120 },
      { kandidat_id: 'PASLON_2', jumlah_suara: 80 }
    ]
  };
  const t0 = Date.now();
  const subRes = await fetch(`${API}/api/c1/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const sub = await subRes.json();
  const elapsed = Date.now() - t0;
  if (!sub.success) throw new Error('Submit gagal: ' + sub.error);
  console.log(`    OK (${elapsed}ms) | ${sub.message}`);

  console.log('\n[4] Verifikasi antrean Redis (BullMQ c1-queue)');
  console.log('    Jalankan: npm --prefix worker start   untuk melihat BATCH INSERT');

  console.log('\n[5] Cek object di MinIO:');
  console.log('    ' + up.image_url);

  console.log('\n== E2E SELESAI =======================================');
}

main().catch((err) => {
  console.error('\nE2E GAGAL:', err.message);
  process.exit(1);
});