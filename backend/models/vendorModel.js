import pool from '../database/db.js';

export async function listVendors({ offset, limit, search, location }) {
  const filters = [];
  const values = [];
  if (search) {
    filters.push('(vendor_name LIKE ? OR phone_number LIKE ? OR location LIKE ?)');
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (location) {
    filters.push('location LIKE ?');
    values.push(`%${location}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [items] = await pool.execute(
    `SELECT vendor_id AS vendorId, vendor_name AS vendorName, phone_number AS phoneNumber,
      location, latitude, longitude, DATE_FORMAT(registration_date, '%Y-%m-%d') AS registrationDate
     FROM Vendors ${where} ORDER BY vendor_name LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const [rows] = await pool.execute(`SELECT COUNT(*) AS total FROM Vendors ${where}`, values);
  return { items, totalItems: rows[0].total };
}

export async function createVendor(vendor) {
  const [result] = await pool.execute(
    `INSERT INTO Vendors (vendor_name, phone_number, location, latitude, longitude)
     VALUES (?, ?, ?, ?, ?)`,
    [vendor.vendorName, vendor.phoneNumber, vendor.location, vendor.latitude, vendor.longitude],
  );
  return result.insertId;
}

export async function updateVendor(vendorId, vendor) {
  const columns = {
    vendorName: 'vendor_name',
    phoneNumber: 'phone_number',
    location: 'location',
    latitude: 'latitude',
    longitude: 'longitude',
  };
  const updates = Object.entries(columns).filter(([key]) => vendor[key] !== undefined);
  if (!updates.length) return false;
  const [result] = await pool.execute(
    `UPDATE Vendors SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE vendor_id = ?`,
    [...updates.map(([key]) => vendor[key]), vendorId],
  );
  if (result.affectedRows) return true;
  const [rows] = await pool.execute('SELECT vendor_id FROM Vendors WHERE vendor_id = ?', [vendorId]);
  return rows.length > 0;
}
