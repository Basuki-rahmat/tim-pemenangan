// Pembuat akun admin:  node src/create-admin.js <username> <password>
// Dijalankan dari folder api/.
const { writePool } = require('./db');
const { hashPassword } = require('./auth');

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password || password.length < 6) {
    console.error('Pakai: node src/create-admin.js <username> <password(min.6)>');    process.exit(1);
  }
  const [dup] = await writePool.query('SELECT id FROM admin_users WHERE username = ?', [username]);
  if (dup.length > 0) {
    console.error(`Username "${username}" sudah terdaftar.`);
    process.exit(1);
  }
  const [r] = await writePool.query('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [
    username.trim(), hashPassword(password)
  ]);
  console.log(`Admin "${username}" dibuat (id ${r.insertId}).`);
  await writePool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
