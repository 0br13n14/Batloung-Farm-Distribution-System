import pool from '../database/db.js';
import AppError from '../utils/appError.js';

const cents = (amount) => Math.round(Number(amount) * 100);

export async function listSales({ offset, limit, vendorId, search, paymentStatus, dateFrom, dateTo }) {
  const filters = [];
  const values = [];
  if (vendorId) {
    filters.push('s.vendor_id = ?');
    values.push(vendorId);
  }
  if (search) {
    filters.push('(v.vendor_name LIKE ? OR v.phone_number LIKE ?)');
    values.push(`%${search}%`, `%${search}%`);
  }
  if (paymentStatus) {
    filters.push('s.payment_status = ?');
    values.push(paymentStatus);
  }
  if (dateFrom) {
    filters.push('s.sale_date >= ?');
    values.push(dateFrom);
  }
  if (dateTo) {
    filters.push('s.sale_date <= ?');
    values.push(dateTo);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [items] = await pool.execute(
    `SELECT s.sale_id AS saleId, s.vendor_id AS vendorId, v.vendor_name AS vendorName,
      s.sale_date AS saleDate, s.payment_method AS paymentMethod, s.amount_paid AS amountPaid,
      s.payment_status AS paymentStatus, s.total_amount AS totalAmount,
      s.total_amount - s.amount_paid AS outstandingBalance, s.created_at AS createdAt
     FROM Sales s JOIN Vendors v ON v.vendor_id = s.vendor_id ${where}
     ORDER BY s.sale_date DESC, s.sale_id DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM Sales s JOIN Vendors v ON v.vendor_id = s.vendor_id ${where}`,
    values,
  );
  return { items, totalItems: rows[0].total };
}

export async function getSale(saleId) {
  const [sales] = await pool.execute(
    `SELECT s.sale_id AS saleId, s.vendor_id AS vendorId, v.vendor_name AS vendorName,
      s.sale_date AS saleDate, s.payment_method AS paymentMethod, s.amount_paid AS amountPaid,
      s.payment_status AS paymentStatus, s.total_amount AS totalAmount,
      s.total_amount - s.amount_paid AS outstandingBalance, s.created_at AS createdAt
     FROM Sales s JOIN Vendors v ON v.vendor_id = s.vendor_id WHERE s.sale_id = ?`,
    [saleId],
  );
  if (!sales.length) return null;
  const [items] = await pool.execute(
    `SELECT sd.fruit_id AS fruitId, f.fruit_name AS fruitName,
      sd.packaging_size AS packagingSize, sd.quantity, sd.unit_price AS unitPrice
     FROM Sales_details sd JOIN Fruits f ON f.fruit_id = sd.fruit_id
     WHERE sd.sale_id = ?`,
    [saleId],
  );
  return { ...sales[0], items };
}

export async function createSale(sale) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [vendors] = await connection.execute(
      'SELECT vendor_id FROM Vendors WHERE vendor_id = ? FOR UPDATE',
      [sale.vendorId],
    );
    if (!vendors.length) throw new AppError(404, 'The selected vendor was not found.');

    let totalCents = 0;
    for (const item of sale.items) {
      const [stockRows] = await connection.execute(
        `SELECT st.stock_id, st.available_quantity AS availableQuantity,
          st.unit_selling_price AS unitSellingPrice, f.fruit_name AS fruitName, f.status
         FROM Stock st JOIN Fruits f ON f.fruit_id = st.fruit_id
         WHERE st.fruit_id = ? AND st.packaging_size = ? FOR UPDATE`,
        [item.fruitId, item.packagingSize],
      );
      const stock = stockRows[0];
      if (!stock || stock.status !== 'active') {
        throw new AppError(400, `This fruit is inactive or unavailable in ${item.packagingSize} packaging.`);
      }
      if (stock.availableQuantity < item.quantity) {
        throw new AppError(
          400,
          `Only ${stock.availableQuantity} ${item.packagingSize} boxes of ${stock.fruitName} are in stock. Reduce the quantity or record a purchase first.`,
        );
      }
      item.stockId = stock.stock_id;
      item.unitPrice = stock.unitSellingPrice;
      const unitPriceCents = cents(stock.unitSellingPrice);
      if (item.quantity > Math.floor((999999999999 - totalCents) / unitPriceCents)) {
        throw new AppError(400, 'Sale total is above the maximum supported amount.');
      }
      totalCents += unitPriceCents * item.quantity;
    }

    const totalAmount = totalCents / 100;
    if (sale.amountPaid > totalAmount) throw new AppError(400, 'Amount paid cannot exceed the sale total.');
    const paymentStatus = cents(sale.amountPaid) === totalCents
      ? 'PAID'
      : sale.amountPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    const [result] = await connection.execute(
      `INSERT INTO Sales (vendor_id, sale_date, payment_method, amount_paid, payment_status, total_amount)
       VALUES (?, COALESCE(?, CURRENT_DATE), ?, ?, ?, ?)`,
      [sale.vendorId, sale.saleDate || null, sale.paymentMethod, sale.amountPaid, paymentStatus, totalAmount],
    );

    for (const item of sale.items) {
      await connection.execute(
        `INSERT INTO Sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, item.fruitId, item.packagingSize, item.quantity, item.unitPrice],
      );
      await connection.execute(
        'UPDATE Stock SET available_quantity = available_quantity - ? WHERE stock_id = ?',
        [item.quantity, item.stockId],
      );
    }

    await connection.commit();
    return { saleId: result.insertId, totalAmount, amountPaid: sale.amountPaid, paymentStatus };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function addSalePayment(saleId, amount, paymentMethod) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sales] = await connection.execute(
      'SELECT total_amount AS totalAmount, amount_paid AS amountPaid FROM Sales WHERE sale_id = ? FOR UPDATE',
      [saleId],
    );
    if (!sales.length) throw new AppError(404, 'The sale was not found.');
    const sale = sales[0];
    if (cents(sale.amountPaid) + cents(amount) > cents(sale.totalAmount)) {
      throw new AppError(400, 'This payment would exceed the outstanding sale balance.');
    }
    const amountPaid = (cents(sale.amountPaid) + cents(amount)) / 100;
    const paymentStatus = cents(amountPaid) === cents(sale.totalAmount)
      ? 'PAID'
      : amountPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    await connection.execute(
      `UPDATE Sales SET amount_paid = ?, payment_status = ?,
        payment_method = COALESCE(?, payment_method) WHERE sale_id = ?`,
      [amountPaid, paymentStatus, paymentMethod || null, saleId],
    );
    await connection.commit();
    return { saleId, amountPaid, paymentStatus, outstandingBalance: (cents(sale.totalAmount) - cents(amountPaid)) / 100 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
