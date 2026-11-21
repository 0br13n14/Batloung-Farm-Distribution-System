import pool from '../database/db.js';

export async function topFruits() {
  const [items] = await pool.query(
    `SELECT f.fruit_id AS fruitId, f.fruit_name AS fruitName,
      COALESCE(SUM(sd.quantity), 0) AS totalBoxesSold,
      COUNT(DISTINCT sd.sale_id) AS numberOfSales
     FROM Fruits f LEFT JOIN Sales_details sd ON sd.fruit_id = f.fruit_id
     GROUP BY f.fruit_id, f.fruit_name
     ORDER BY totalBoxesSold DESC, f.fruit_name LIMIT 5`,
  );
  return items;
}

export async function revenue(startDate, endDate) {
  const [rows] = await pool.execute(
    `SELECT ? AS startDate, ? AS endDate, COUNT(sale_id) AS completedSalesCount,
      COALESCE(SUM(total_amount), 0.00) AS totalSalesRevenue,
      COALESCE(SUM(amount_paid), 0.00) AS totalAmountCollected,
      COALESCE(SUM(total_amount - amount_paid), 0.00) AS totalUncollectedInRange
     FROM Sales WHERE sale_date BETWEEN ? AND ?`,
    [startDate, endDate, startDate, endDate],
  );
  return rows[0];
}

export async function topVendor() {
  const [rows] = await pool.query(
    `SELECT v.vendor_id AS vendorId, v.vendor_name AS vendorName,
      v.phone_number AS phoneNumber, v.location,
      COALESCE(SUM(sd.quantity), 0) AS totalBoxesPurchased,
      (SELECT COALESCE(SUM(sale.total_amount - sale.amount_paid), 0.00)
       FROM Sales sale WHERE sale.vendor_id = v.vendor_id) AS outstandingBalance
     FROM Vendors v JOIN Sales s ON s.vendor_id = v.vendor_id
     JOIN Sales_details sd ON sd.sale_id = s.sale_id
     GROUP BY v.vendor_id, v.vendor_name, v.phone_number, v.location
     ORDER BY totalBoxesPurchased DESC, v.vendor_name LIMIT 1`,
  );
  return rows[0] || null;
}

export async function stockLevels() {
  const [items] = await pool.query(
    `SELECT f.fruit_id AS fruitId, f.fruit_name AS fruitName, f.status AS fruitStatus,
      st.packaging_size AS packagingSize, st.available_quantity AS availableQuantity,
      st.unit_selling_price AS unitSellingPrice,
      CASE WHEN st.available_quantity = 0 THEN 'OUT_OF_STOCK'
        WHEN st.available_quantity <= f.low_stock_threshold THEN 'LOW_STOCK'
        ELSE 'IN_STOCK' END AS stockStatus
     FROM Stock st JOIN Fruits f ON f.fruit_id = st.fruit_id
     ORDER BY f.fruit_name, FIELD(st.packaging_size, 'small', 'medium', 'large')`,
  );
  return items;
}
