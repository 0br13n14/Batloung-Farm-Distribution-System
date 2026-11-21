import pool from '../database/db.js';

export async function listSuppliers({ offset, limit, search }) {
  const where = search ? 'WHERE business_name LIKE ? OR contact_person LIKE ? OR phone LIKE ?' : '';
  const values = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
  const [items] = await pool.execute(
    `SELECT supplier_id AS supplierId, business_name AS businessName, contact_person AS contactPerson,
      phone, province, address, created_at AS createdAt
     FROM Suppliers ${where} ORDER BY business_name LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const [rows] = await pool.execute(`SELECT COUNT(*) AS total FROM Suppliers ${where}`, values);
  return { items, totalItems: rows[0].total };
}

export async function createSupplier(supplier) {
  const [result] = await pool.execute(
    `INSERT INTO Suppliers (business_name, contact_person, phone, province, address)
     VALUES (?, ?, ?, ?, ?)`,
    [supplier.businessName, supplier.contactPerson, supplier.phone, supplier.province, supplier.address],
  );
  return result.insertId;
}

export async function updateSupplier(supplierId, supplier) {
  const columns = {
    businessName: 'business_name',
    contactPerson: 'contact_person',
    phone: 'phone',
    province: 'province',
    address: 'address',
  };
  const updates = Object.entries(columns).filter(([key]) => supplier[key] !== undefined);
  if (!updates.length) return false;
  const [result] = await pool.execute(
    `UPDATE Suppliers SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE supplier_id = ?`,
    [...updates.map(([key]) => supplier[key]), supplierId],
  );
  if (result.affectedRows) return true;
  const [rows] = await pool.execute('SELECT supplier_id FROM Suppliers WHERE supplier_id = ?', [supplierId]);
  return rows.length > 0;
}

export async function deleteSupplier(supplierId) {
  const connection = await pool.getConnection();
  try {
    const [purchases] = await connection.execute(
      'SELECT purchase_id FROM Purchases WHERE supplier_id = ? LIMIT 1',
      [supplierId],
    );
    if (purchases.length) return 'referenced';
    const [result] = await connection.execute('DELETE FROM Suppliers WHERE supplier_id = ?', [supplierId]);
    return result.affectedRows ? 'deleted' : 'missing';
  } finally {
    connection.release();
  }
}
