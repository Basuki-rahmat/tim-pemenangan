require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: PORT,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    name: process.env.DB_NAME || 'db_pemilu_c1'
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
    region: process.env.S3_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET || 'c1-uploads',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true'
  },
  // Endpoint publik S3 (dipakai untuk presigned URL & URL gambar yang diakses
  // browser). Beda dengan s3.endpoint (internal, untuk operasi dari dalam
  // container/VPC). Default: sama dengan s3.endpoint (kompatibel Laragon).
  s3PublicEndpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
};