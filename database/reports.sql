USE batloung_farm`;

-- 1. Five most frequently sold fruits (by total boxes sold across all packaging sizes)
SELECT
  f.fruit_id,
  f.fruit_name,
  COALESCE(SUM(sd.quantity), 0) AS total_boxes_sold,
  COUNT(DISTINCT sd.sale_id) AS number_of_sales
FROM Fruits f
LEFT JOIN Sales_details sd ON sd.fruit_id = f.fruit_id
GROUP BY f.fruit_id, f.fruit_name
ORDER BY total_boxes_sold DESC, f.fruit_name ASC
LIMIT 5;

-- 2. Total sales revenue generated during a specified date range
-- Replace '2026-11-01' and '2026-11-30' with the desired start and end dates
SELECT
  '2026-11-01' AS start_date,
  '2026-11-30' AS end_date,
  COUNT(s.sale_id) AS completed_sales_count,
  COALESCE(SUM(s.total_amount), 0.00) AS total_sales_revenue,
  COALESCE(SUM(s.amount_paid), 0.00) AS total_amount_collected,
  COALESCE(SUM(s.total_amount - s.amount_paid), 0.00) AS total_uncollected_in_range
FROM Sales s
WHERE s.sale_date BETWEEN '2026-11-01' AND '2026-11-30';

-- 3. Vendor who has purchased (bought from Batloung Farm) the highest number of boxes
SELECT
  v.vendor_id,
  v.vendor_name,
  v.phone_number,
  v.location,
  COALESCE(SUM(sd.quantity), 0) AS total_boxes_purchased,
  COALESCE(SUM(s.total_amount - s.amount_paid), 0.00) AS outstanding_balance
FROM Vendors v
JOIN Sales s ON s.vendor_id = v.vendor_id
JOIN Sales_details sd ON sd.sale_id = s.sale_id
GROUP BY v.vendor_id, v.vendor_name, v.phone_number, v.location
ORDER BY total_boxes_purchased DESC, v.vendor_name ASC
LIMIT 1;

-- 4. Current stock levels for each fruit and packaging size
SELECT
  f.fruit_id,
  f.fruit_name,
  f.status AS fruit_status,
  st.packaging_size,
  st.available_quantity,
  st.unit_selling_price,
  CASE
    WHEN st.available_quantity = 0 THEN 'OUT_OF_STOCK'
    WHEN st.available_quantity <= f.low_stock_threshold THEN 'LOW_STOCK'
    ELSE 'IN_STOCK'
  END AS stock_status
FROM Stock st
JOIN Fruits f ON f.fruit_id = st.fruit_id
ORDER BY f.fruit_name ASC, FIELD(st.packaging_size, 'small', 'medium', 'large');
