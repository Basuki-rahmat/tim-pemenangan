require('dotenv').config();

module.exports = {
  queueName: 'c1-queue',
  batchSize: parseInt(process.env.PBATCH_SIZE || '500', 10),
  flushIntervalMs: parseInt(process.env.PFLUSH_INTERVAL_MS || '1000', 10),
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    name: process.env.DB_NAME || 'db_pemilu_c1',
    connectionLimit: parseInt(process.env.DB_POOL || '10', 10)
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
    bucket: process.env.S3_BUCKET || 'c1-uploads'
  }
};