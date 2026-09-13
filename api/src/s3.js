const { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');
const config = require('./config');

const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey
  },
  forcePathStyle: config.s3.forcePathStyle
});

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
  } catch (err) {
    await s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
    console.log(`[s3] Bucket "${config.s3.bucket}" dibuat.`);
  }
}

function publicUrl(key) {
  return `${config.s3.endpoint}/${config.s3.bucket}/${key}`;
}

async function createPresignedUpload({ filename, contentType }) {
  const safe = (filename || 'c1.jpg').replace(/[^\w.\-]+/g, '_');
  const key = `c1/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safe}`;
  const expiresInSec = 300;

  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: contentType || 'image/jpeg'
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSec });

  return {
    image_key: key,
    image_url: publicUrl(key),
    upload_url: uploadUrl,
    method: 'PUT',
    content_type: contentType || 'image/jpeg',
    expires_in_sec: expiresInSec
  };
}

module.exports = { s3, ensureBucket, publicUrl, createPresignedUpload };