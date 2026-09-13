/**
 * ============================================================================
 * [Issue #07] Database Read-Replica Pool untuk Query Analitik Dashboard
 * Mengisolasi query berat analitik (SUM/COUNT/GROUP BY) agar tidak membebani
 * Primary DB yang sedang sibuk menerima BATCH INSERT dari Worker.
 * ============================================================================
 */
const mysql = require('mysql2/promise');
const config = require('./config');

const readHost = process.env.DB_REPLICA_HOST || config.db.host;
const readPort = parseInt(process.env.DB_REPLICA_PORT || String(config.db.port), 10);

const readPool = mysql.createPool({
  host: readHost,
  port: readPort,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 0
});

// ----------------------------------------------------------------------------
// Write pool (Primary): dipakai endpoint Admin (POST/PUT/DELETE).
// Di production arahkan ke MySQL Primary; baca analitik tetap via readPool.
// ----------------------------------------------------------------------------
const writePool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0
});

module.exports = {
  readPool,
  readHost,
  writePool
};
