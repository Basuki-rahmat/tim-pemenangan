/**
 * ============================================================================
 * Auth Admin: hash scrypt (stdlib crypto, tanpa dependensi baru) + token sesi.
 * Token dikirim via header:  Authorization: Bearer <token>
 * Masa berlaku sesi: 12 jam. Sesi disimpan di tabel admin_sessions.
 * ============================================================================
 */
const crypto = require('crypto');
const { writePool } = require('./db');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
  } catch (_) {
    return false;
  }
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Password acak 8 karakter tanpa huruf ambigu (0/O, 1/l)
function genPassword(length = 8) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

async function createSession(userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await writePool.query(
    'INSERT INTO admin_sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
    [token, userId, expiresAt]
  );
  return { token, expires_at: expiresAt };
}

async function getSession(token) {
  if (!token) return null;
  const [rows] = await writePool.query(
    `SELECT s.token, s.expires_at, u.id AS user_id, u.username
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
      WHERE s.token = ?
      LIMIT 1`,
    [token]
  );
  if (rows.length === 0) return null;
  if (new Date(rows[0].expires_at).getTime() < Date.now()) {
    await writePool.query('DELETE FROM admin_sessions WHERE token = ?', [token]);
    return null;
  }
  return rows[0];
}

function bearerToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Middleware: tolak 401 bila tanpa sesi admin yang valid
async function requireAdmin(req, res, next) {
  try {
    const session = await getSession(bearerToken(req));
    if (!session) {
      return res.status(401).json({ success: false, error: 'butuh login admin' });
    }
    req.admin = { id: session.user_id, username: session.username };
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  SESSION_TTL_MS,
  hashPassword,
  verifyPassword,
  genPassword,
  createSession,
  getSession,
  bearerToken,
  requireAdmin
};
