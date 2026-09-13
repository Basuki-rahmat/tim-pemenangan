/**
 * ============================================================================
 * Auth Admin:
 *   POST /api/auth/login            { username, password } -> { token }
 *   POST /api/auth/logout           (Bearer) -> hapus sesi
 *   GET  /api/auth/me               (Bearer) -> info admin + sisa masa sesi
 *   POST /api/auth/change-password  (Bearer) { old_password, new_password }
 * ============================================================================
 */
const { Router } = require('express');
const { writePool } = require('../db');
const { hashPassword, verifyPassword, createSession, bearerToken, requireAdmin } = require('../auth');

const router = Router();

router.post('/login', async (req, res) => {
  const t0 = Date.now();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'username dan password wajib diisi' });
  }
  try {
    const [rows] = await writePool.query(
      'SELECT id, username, password_hash FROM admin_users WHERE username = ? LIMIT 1',
      [username]
    );
    if (rows.length === 0 || !verifyPassword(password, rows[0].password_hash)) {
      // Respons generik agar tidak membocorkan username mana yang terdaftar
      await new Promise((r) => setTimeout(r, 300));
      return res.status(401).json({ success: false, error: 'username atau password salah' });
    }
    const session = await createSession(rows[0].id);
    res.json({
      success: true,
      elapsed_ms: Date.now() - t0,
      data: { username: rows[0].username, token: session.token, expires_at: session.expires_at }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (token) await writePool.query('DELETE FROM admin_sessions WHERE token = ?', [token]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/me', requireAdmin, async (req, res) => {
  try {
    const [rows] = await writePool.query(
      'SELECT expires_at FROM admin_sessions WHERE token = ? LIMIT 1',
      [bearerToken(req)]
    );
    res.json({
      success: true,
      data: { id: req.admin.id, username: req.admin.username, expires_at: rows[0]?.expires_at || null }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/change-password', requireAdmin, async (req, res) => {
  const oldPass = String(req.body.old_password || '');
  const newPass = String(req.body.new_password || '');
  if (newPass.length < 6) {
    return res.status(400).json({ success: false, error: 'password baru minimal 6 karakter' });
  }
  try {
    const [rows] = await writePool.query(
      'SELECT password_hash FROM admin_users WHERE id = ? LIMIT 1', [req.admin.id]
    );
    if (rows.length === 0 || !verifyPassword(oldPass, rows[0].password_hash)) {
      return res.status(401).json({ success: false, error: 'password lama salah' });
    }
    await writePool.query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [
      hashPassword(newPass), req.admin.id
    ]);
    // Amankan: cabut semua sesi lain, sesi saat ini tetap berlaku
    await writePool.query('DELETE FROM admin_sessions WHERE user_id = ? AND token <> ?', [
      req.admin.id, bearerToken(req)
    ]);
    res.json({ success: true, message: 'password berhasil diubah' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
