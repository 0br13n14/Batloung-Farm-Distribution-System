USE batloung_farm;

INSERT INTO Users (full_name, username, role, is_active) VALUES
  ('Nicholas Liphapang', 'nicho-admin', 'admin', 1),
  ('Nikolai Liphapang', 'niko-sales', 'sales', 1);

INSERT INTO Suppliers (business_name, contact_person, phone, province, address) VALUES
  ('Highveld Orchard Traders', 'Pieter van Wyk', '+27 11 492 3104', 'Gauteng', '42 City Deep Produce Market, Johannesburg'),
  ('Kroonstad Citrus & Fruit Co.', 'Annelie Botha', '+27 56 215 8820', 'Free State', '18 Voortrekker Road, Kroonstad'),
  ('Elgin Valley Packhouse', 'Sipho Dlamini', '+27 21 859 4412', 'Western Cape', '9 Oak Avenue Industrial Park, Grabouw'),
  ('Lowveld Mango & Subtropicals', 'Mpho Makhubela', '+27 13 752 6091', 'Mpumalanga', '74 Kaapschehoop Road, Nelspruit'),
  ('Durban Coast Produce Supply', 'Nadia Naidoo', '+27 31 569 1245', 'KwaZulu-Natal', '15 Clairwood Market Road, Durban');

INSERT INTO Fruits (fruit_name, description, status, low_stock_threshold) VALUES
  ('Apples', 'Crisp South African Royal Gala and Granny Smith orchard boxes', 'active', 10),
  ('Bananas', 'Ripe-selected Cavendish banana crates for daily market stalls', 'active', 12),
  ('Oranges', 'Juicy Valencia and Navel orange boxes', 'active', 10),
  ('Mangoes', 'Sweet subtropical Kent and Tommy Atkins mango boxes', 'active', 10),
  ('Grapes', 'Fresh seedless red and white table grape crates', 'active', 10);

-- Packaging-specific stock rows: small, medium, and large per fruit
INSERT INTO Stock (fruit_id, packaging_size, available_quantity, unit_selling_price) VALUES
  (1, 'small', 24, 140.00),
  (1, 'medium', 18, 220.00),
  (1, 'large', 6, 310.00),
  (2, 'small', 30, 125.00),
  (2, 'medium', 22, 195.00),
  (2, 'large', 14, 275.00),
  (3, 'small', 20, 130.00),
  (3, 'medium', 9, 205.00),
  (3, 'large', 12, 290.00),
  (4, 'small', 15, 160.00),
  (4, 'medium', 7, 245.00),
  (4, 'large', 5, 340.00),
  (5, 'small', 16, 175.00),
  (5, 'medium', 11, 260.00),
  (5, 'large', 8, 365.00);

INSERT INTO Vendors (vendor_name, phone_number, location, latitude, longitude, registration_date) VALUES
  ('Maseru Central Market Stall 14', '+266 5811 2041', 'Maseru Central, Maseru', -29.310050, 27.478220, '2026-09-04'),
  ('Pitso Ground Fresh Corner', '+266 5892 4410', 'Pitso Ground, Maseru', -29.315620, 27.486410, '2026-09-12'),
  ('Ha Tsosane Fruit Vendors', '+266 6304 7789', 'Ha Tsosane, Maseru', -29.311007341021906, 27.53935503238219, '2026-09-20'),
  ('Sea Point Taxi Rank Kiosk', '+266 5940 1182', 'Sea Point, Maseru', -29.309981804453013, 27.497163727355186, '2026-10-03'),
  ('Qoaling Junction Produce', '+266 5877 9034', 'Qoaling, Maseru', -29.354890, 27.510640, '2026-10-15');

INSERT INTO Purchases (supplier_id, purchase_date, total_amount) VALUES
  (3, '2026-11-02', 4980.00),
  (2, '2026-11-08', 5410.00),
  (4, '2026-11-14', 4420.00);

INSERT INTO Purchase_details (purchase_id, fruit_id, packaging_size, quantity, unit_cost) VALUES
  (1, 1, 'small', 12, 95.00),
  (1, 1, 'large', 14, 210.00),
  (1, 5, 'medium', 6, 175.00),
  (2, 2, 'medium', 16, 140.00),
  (2, 3, 'small', 12, 85.00),
  (2, 3, 'large', 8, 240.00),
  (3, 4, 'small', 10, 110.00),
  (3, 4, 'medium', 8, 175.00),
  (3, 4, 'large', 6, 270.00);

INSERT INTO Sales (vendor_id, sale_date, payment_method, amount_paid, payment_status, total_amount) VALUES
  (1, '2026-11-05', 'Cash', 1290.00, 'PAID', 1290.00),
  (2, '2026-11-10', 'Mobile money', 900.00, 'PARTIALLY_PAID', 1485.00),
  (3, '2026-11-13', 'Outstanding', 0.00, 'UNPAID', 1020.00),
  (4, '2026-11-16', 'Cash', 780.00, 'PAID', 780.00),
  (5, '2026-11-18', 'Mobile money', 520.00, 'PARTIALLY_PAID', 1110.00);

INSERT INTO Sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price) VALUES
  (1, 1, 'small', 3, 140.00),
  (1, 2, 'large', 2, 275.00),
  (1, 3, 'small', 2, 130.00),
  (2, 2, 'medium', 3, 195.00),
  (2, 5, 'medium', 2, 260.00),
  (2, 3, 'small', 3, 130.00),
  (3, 1, 'large', 2, 310.00),
  (3, 4, 'medium', 1, 245.00),
  (3, 3, 'small', 1, 130.00),
  (4, 2, 'small', 4, 125.00),
  (4, 3, 'large', 1, 290.00),
  (5, 4, 'small', 3, 160.00),
  (5, 5, 'large', 1, 365.00),
  (5, 3, 'small', 2, 130.00);
