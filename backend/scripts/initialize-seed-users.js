import 'dotenv/config';
import pool from '../database/db.js';
import { hashPassword } from '../utils/credentials.js';

const seedAccounts = [
  { username: 'nicho-admin', password: process.env.ADMIN_PASSWORD },
  { username: 'niko-sales', password: process.env.SALES_PASSWORD },
];

async function initializeSeedUsers() {
  if (seedAccounts.some(({ password }) => !password || password.length < 5)) {
    throw new Error('Set ADMIN_PASSWORD and SALES_PASSWORD to at least 5 characters.');
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const account of seedAccounts) {
      const passwordHash = await hashPassword(account.password);
      const [result] = await connection.execute(
        `UPDATE Users SET password_hash = ?
         WHERE username = ? AND is_active = 1 AND (password_hash IS NULL OR password_hash = '')`,
        [passwordHash, account.username],
      );
      if (result.affectedRows !== 1) {
        throw new Error(`Could not initialize ${account.username}; confirm the active seeded user exists and has no password.`);
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  console.info('Seed account passwords initialized.');
}

initializeSeedUsers()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
