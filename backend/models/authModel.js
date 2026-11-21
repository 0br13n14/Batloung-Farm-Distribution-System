import pool from '../database/db.js';

export async function findUserByUsername(username) {
  const [users] = await pool.execute(
    `SELECT user_id AS userId, username, full_name AS fullName, role, is_active AS isActive,
      password_hash AS passwordHash
     FROM Users WHERE username = ? LIMIT 1`,
    [username],
  );
  return users[0] || null;
}

export async function findUserById(userId) {
  const [users] = await pool.execute(
    `SELECT user_id AS userId, username, full_name AS fullName, role, is_active AS isActive
     FROM Users WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return users[0] || null;
}
