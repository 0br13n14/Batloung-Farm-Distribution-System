import pool from '../database/db.js';

export async function listFruits({ offset, limit, search, status }) {
  const filters = [];
  const values = [];
  if (search) {
    filters.push('fruit_name LIKE ?');
    values.push(`%${search}%`);
  }
  if (status) {
    filters.push('status = ?');
    values.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [items] = await pool.execute(
    `SELECT fruit_id AS fruitId, fruit_name AS fruitName, description, status,
      low_stock_threshold AS lowStockThreshold
     FROM Fruits ${where} ORDER BY fruit_name LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const [rows] = await pool.execute(`SELECT COUNT(*) AS total FROM Fruits ${where}`, values);
  return { items, totalItems: rows[0].total };
}

export async function createFruit(fruit) {
  const [result] = await pool.execute(
    `INSERT INTO Fruits (fruit_name, description, status, low_stock_threshold)
     VALUES (?, ?, ?, ?)`,
    [fruit.fruitName, fruit.description, fruit.status, fruit.lowStockThreshold],
  );
  return result.insertId;
}

export async function updateFruit(fruitId, fruit) {
  const columns = {
    fruitName: 'fruit_name',
    description: 'description',
    status: 'status',
    lowStockThreshold: 'low_stock_threshold',
  };
  const updates = Object.entries(columns).filter(([key]) => fruit[key] !== undefined);
  if (!updates.length) return false;
  const [result] = await pool.execute(
    `UPDATE Fruits SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE fruit_id = ?`,
    [...updates.map(([key]) => fruit[key]), fruitId],
  );
  if (result.affectedRows) return true;
  const [rows] = await pool.execute('SELECT fruit_id FROM Fruits WHERE fruit_id = ?', [fruitId]);
  return rows.length > 0;
}

export async function deleteFruit(fruitId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [fruits] = await connection.execute(
      'SELECT fruit_id FROM Fruits WHERE fruit_id = ? FOR UPDATE',
      [fruitId],
    );
    if (!fruits.length) {
      await connection.rollback();
      return 'missing';
    }

    const [purchases] = await connection.execute(
      'SELECT purchase_detail_id FROM Purchase_details WHERE fruit_id = ? LIMIT 1',
      [fruitId],
    );
    const [sales] = await connection.execute(
      'SELECT sales_detail_id FROM Sales_details WHERE fruit_id = ? LIMIT 1',
      [fruitId],
    );
    if (purchases.length || sales.length) {
      await connection.rollback();
      return 'referenced';
    }

    await connection.execute('DELETE FROM Stock WHERE fruit_id = ?', [fruitId]);
    await connection.execute('DELETE FROM Fruits WHERE fruit_id = ?', [fruitId]);
    await connection.commit();
    return 'deleted';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listStock({ offset, limit, search, packagingSize, stockStatus, minPrice, maxPrice, groupByFruit }) {
  const filters = [];
  const values = [];
  if (search) {
    filters.push('f.fruit_name LIKE ?');
    values.push(`%${search}%`);
  }
  if (packagingSize) {
    filters.push('st.packaging_size = ?');
    values.push(packagingSize);
  }
  if (stockStatus === 'low') filters.push('st.available_quantity <= f.low_stock_threshold');
  if (stockStatus === 'out') filters.push('st.available_quantity = 0');
  if (stockStatus === 'available') filters.push('st.available_quantity > f.low_stock_threshold');
  if (minPrice !== undefined) {
    filters.push('st.unit_selling_price >= ?');
    values.push(minPrice);
  }
  if (maxPrice !== undefined) {
    filters.push('st.unit_selling_price <= ?');
    values.push(maxPrice);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  if (groupByFruit) {
    const [countRows] = await pool.execute(
      `SELECT COUNT(DISTINCT f.fruit_id) AS total FROM Stock st JOIN Fruits f ON f.fruit_id = st.fruit_id ${where}`,
      values,
    );
    const [groups] = await pool.execute(
      `SELECT f.fruit_id AS fruitId FROM Stock st JOIN Fruits f ON f.fruit_id = st.fruit_id ${where}
       GROUP BY f.fruit_id, f.fruit_name ORDER BY f.fruit_name LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );
    if (!groups.length) return { items: [], totalItems: countRows[0].total };
    const fruitIds = groups.map((group) => group.fruitId);
    const idPlaceholders = fruitIds.map(() => '?').join(', ');
    const groupedWhere = filters.length
      ? `${where} AND f.fruit_id IN (${idPlaceholders})`
      : `WHERE f.fruit_id IN (${idPlaceholders})`;
    const [items] = await pool.execute(
      `SELECT st.stock_id AS stockId, f.fruit_id AS fruitId, f.fruit_name AS fruitName,
        f.status AS fruitStatus, st.packaging_size AS packagingSize,
        st.available_quantity AS availableQuantity, st.unit_selling_price AS unitSellingPrice,
        f.low_stock_threshold AS lowStockThreshold,
        CASE WHEN st.available_quantity = 0 THEN 'OUT_OF_STOCK'
          WHEN st.available_quantity <= f.low_stock_threshold THEN 'LOW_STOCK'
          ELSE 'IN_STOCK' END AS stockStatus
       FROM Stock st JOIN Fruits f ON f.fruit_id = st.fruit_id ${groupedWhere}
       ORDER BY f.fruit_name, FIELD(st.packaging_size, 'small', 'medium', 'large')`,
      [...values, ...fruitIds],
    );
    return { items, totalItems: countRows[0].total };
  }

  const [items] = await pool.execute(
    `SELECT st.stock_id AS stockId, f.fruit_id AS fruitId, f.fruit_name AS fruitName,
      f.status AS fruitStatus, st.packaging_size AS packagingSize,
      st.available_quantity AS availableQuantity, st.unit_selling_price AS unitSellingPrice,
      f.low_stock_threshold AS lowStockThreshold,
      CASE WHEN st.available_quantity = 0 THEN 'OUT_OF_STOCK'
        WHEN st.available_quantity <= f.low_stock_threshold THEN 'LOW_STOCK'
        ELSE 'IN_STOCK' END AS stockStatus
     FROM Stock st JOIN Fruits f ON f.fruit_id = st.fruit_id ${where}
     ORDER BY f.fruit_name, FIELD(st.packaging_size, 'small', 'medium', 'large')
     LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM Stock st JOIN Fruits f ON f.fruit_id = st.fruit_id ${where}`,
    values,
  );
  return { items, totalItems: rows[0].total };
}

export async function updateStock(stockId, changes) {
  const columns = { availableQuantity: 'available_quantity', unitSellingPrice: 'unit_selling_price' };
  const updates = Object.entries(columns).filter(([key]) => changes[key] !== undefined);
  if (!updates.length) return false;
  const [result] = await pool.execute(
    `UPDATE Stock SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE stock_id = ?`,
    [...updates.map(([key]) => changes[key]), stockId],
  );
  if (result.affectedRows) return true;
  const [rows] = await pool.execute('SELECT stock_id FROM Stock WHERE stock_id = ?', [stockId]);
  return rows.length > 0;
}

export async function deleteStock(stockId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [stockRows] = await connection.execute(
      'SELECT fruit_id AS fruitId, packaging_size AS packagingSize FROM Stock WHERE stock_id = ? FOR UPDATE',
      [stockId],
    );
    if (!stockRows.length) {
      await connection.rollback();
      return 'missing';
    }

    const { fruitId, packagingSize } = stockRows[0];
    const [purchases] = await connection.execute(
      'SELECT purchase_detail_id FROM Purchase_details WHERE fruit_id = ? AND packaging_size = ? LIMIT 1',
      [fruitId, packagingSize],
    );
    const [sales] = await connection.execute(
      'SELECT sales_detail_id FROM Sales_details WHERE fruit_id = ? AND packaging_size = ? LIMIT 1',
      [fruitId, packagingSize],
    );
    if (purchases.length || sales.length) {
      await connection.rollback();
      return 'referenced';
    }

    await connection.execute('DELETE FROM Stock WHERE stock_id = ?', [stockId]);
    await connection.commit();
    return 'deleted';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
