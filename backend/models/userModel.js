import pool from '../database/db.js';

export async function listUsers({ offset, limit, search }) {
  const where = search ? 'WHERE full_name LIKE ? OR username LIKE ?' : '';
  const values = search ? [`%${search}%`, `%${search}%`] : [];
  const [items] = await pool.execute(
    `SELECT user_id AS userId, full_name AS fullName, username, role,
      is_active AS isActive, created_at AS createdAt
     FROM Users ${where} ORDER BY full_name, user_id LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const [rows] = await pool.execute(`SELECT COUNT(*) AS total FROM Users ${where}`, values);
  return { items, totalItems: rows[0].total };
}

export async function createUser({ fullName, username, passwordHash, role }) {
  const [result] = await pool.execute(
    `INSERT INTO Users (full_name, username, password_hash, role)
     VALUES (?, ?, ?, ?)`,
    [fullName, username, passwordHash, role],
  );
  return result.insertId;
}

export async function updateUser(userId, user) {
  const columns = {
    fullName: 'full_name',
    username: 'username',
    passwordHash: 'password_hash',
    role: 'role',
    isActive: 'is_active',
  };
  const updates = Object.entries(columns).filter(([key]) => user[key] !== undefined);
  const [result] = await pool.execute(
    `UPDATE Users SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE user_id = ?`,
    [...updates.map(([key]) => user[key]), userId],
  );
  if (result.affectedRows) return true;
  const [rows] = await pool.execute('SELECT user_id FROM Users WHERE user_id = ?', [userId]);
  return rows.length > 0;
}
