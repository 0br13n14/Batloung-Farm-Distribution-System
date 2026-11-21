import pool from '../database/db.js';
import AppError from '../utils/appError.js';

const cents = (amount) => Math.round(Number(amount) * 100);

export async function listPurchases({ offset, limit, supplierId, search, dateFrom, dateTo }) {
  const filters = [];
  const values = [];
  if (supplierId) {
    filters.push('p.supplier_id = ?');
    values.push(supplierId);
  }
  if (search) {
    filters.push('s.business_name LIKE ?');
    values.push(`%${search}%`);
  }
  if (dateFrom) {
    filters.push('p.purchase_date >= ?');
    values.push(dateFrom);
  }
  if (dateTo) {
    filters.push('p.purchase_date <= ?');
    values.push(dateTo);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [items] = await pool.execute(
    `SELECT p.purchase_id AS purchaseId, p.supplier_id AS supplierId,
      s.business_name AS supplierName, p.purchase_date AS purchaseDate,
      p.total_amount AS totalAmount, p.created_at AS createdAt
     FROM Purchases p JOIN Suppliers s ON s.supplier_id = p.supplier_id ${where}
     ORDER BY p.purchase_date DESC, p.purchase_id DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM Purchases p JOIN Suppliers s ON s.supplier_id = p.supplier_id ${where}`,
    values,
  );
  return { items, totalItems: rows[0].total };
}

export async function getPurchase(purchaseId) {
  const [purchases] = await pool.execute(
    `SELECT p.purchase_id AS purchaseId, p.supplier_id AS supplierId,
      s.business_name AS supplierName, p.purchase_date AS purchaseDate,
      p.total_amount AS totalAmount, p.created_at AS createdAt
     FROM Purchases p JOIN Suppliers s ON s.supplier_id = p.supplier_id
     WHERE p.purchase_id = ?`,
    [purchaseId],
  );
  if (!purchases.length) return null;
  const [items] = await pool.execute(
    `SELECT pd.fruit_id AS fruitId, f.fruit_name AS fruitName,
      pd.packaging_size AS packagingSize, pd.quantity, pd.unit_cost AS unitCost
     FROM Purchase_details pd JOIN Fruits f ON f.fruit_id = pd.fruit_id
     WHERE pd.purchase_id = ?`,
    [purchaseId],
  );
  return { ...purchases[0], items };
}

export async function createPurchase(purchase) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [suppliers] = await connection.execute(
      'SELECT supplier_id FROM Suppliers WHERE supplier_id = ? FOR UPDATE',
      [purchase.supplierId],
    );
    if (!suppliers.length) throw new AppError(404, 'The selected supplier was not found.');

    let totalCents = 0;
    for (const item of purchase.items) {
      const unitCostCents = cents(item.unitCost);
      if (item.quantity > Math.floor((999999999999 - totalCents) / unitCostCents)) {
        throw new AppError(400, 'Purchase total is above the maximum supported amount.');
      }
      totalCents += unitCostCents * item.quantity;
    }
    const totalAmount = totalCents / 100;
    const [result] = await connection.execute(
      `INSERT INTO Purchases (supplier_id, purchase_date, total_amount)
       VALUES (?, COALESCE(?, CURRENT_DATE), ?)`,
      [purchase.supplierId, purchase.purchaseDate || null, totalAmount],
    );

    for (const item of purchase.items) {
      const [fruits] = await connection.execute(
        'SELECT fruit_id FROM Fruits WHERE fruit_id = ? AND status = ? FOR UPDATE',
        [item.fruitId, 'active'],
      );
      if (!fruits.length) throw new AppError(400, `Fruit ${item.fruitId} is inactive or does not exist.`);
      await connection.execute(
        `INSERT INTO Purchase_details (purchase_id, fruit_id, packaging_size, quantity, unit_cost)
         VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, item.fruitId, item.packagingSize, item.quantity, item.unitCost],
      );
      const [stock] = await connection.execute(
        `SELECT stock_id, available_quantity AS availableQuantity
         FROM Stock WHERE fruit_id = ? AND packaging_size = ? FOR UPDATE`,
        [item.fruitId, item.packagingSize],
      );
      const sellingPrice = item.unitSellingPrice || item.unitCost;
      if (stock.length) {
        if (stock[0].availableQuantity > 2147483647 - item.quantity) {
          throw new AppError(400, 'Purchase would exceed the supported stock quantity.');
        }
        await connection.execute(
          `UPDATE Stock SET available_quantity = available_quantity + ? WHERE stock_id = ?`,
          [item.quantity, stock[0].stock_id],
        );
      } else {
        await connection.execute(
          `INSERT INTO Stock (fruit_id, packaging_size, available_quantity, unit_selling_price)
           VALUES (?, ?, ?, ?)`,
          [item.fruitId, item.packagingSize, item.quantity, sellingPrice],
        );
      }
    }

    await connection.commit();
    return { purchaseId: result.insertId, totalAmount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
