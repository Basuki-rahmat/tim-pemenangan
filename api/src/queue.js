const { Queue } = require('bullmq');
const config = require('./config');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null
};

const c1Queue = new Queue('c1-queue', { connection });

module.exports = { c1Queue };