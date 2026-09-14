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