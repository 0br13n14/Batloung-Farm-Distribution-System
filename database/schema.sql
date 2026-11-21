CREATE DATABASE IF NOT EXISTS batloung_farm
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE batloung_farm;

CREATE TABLE Users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  role ENUM('admin', 'sales') NOT NULL DEFAULT 'sales',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Suppliers (
  supplier_id INT AUTO_INCREMENT PRIMARY KEY,
  business_name VARCHAR(140) NOT NULL,
  contact_person VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  province ENUM(
    'Gauteng',
    'Free State',
    'KwaZulu-Natal',
    'Western Cape',
    'Eastern Cape',
    'Limpopo',
    'Mpumalanga',
    'North West'
  ) NOT NULL,
  address VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_supplier_business_phone UNIQUE (business_name, phone)
);

CREATE TABLE Fruits (
  fruit_id INT AUTO_INCREMENT PRIMARY KEY,
  fruit_name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  low_stock_threshold INT NOT NULL DEFAULT 10,
  CONSTRAINT chk_fruit_low_stock_threshold CHECK (low_stock_threshold >= 0)
);

CREATE TABLE Vendors (
  vendor_id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_name VARCHAR(140) NOT NULL,
  phone_number VARCHAR(30) NOT NULL UNIQUE,
  location VARCHAR(160) NOT NULL,
  latitude DECIMAL(9, 6) NULL,
  longitude DECIMAL(9, 6) NULL,
  registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vendor_name (vendor_name),
  INDEX idx_vendor_location (location)
);

CREATE TABLE Stock (
  stock_id INT AUTO_INCREMENT PRIMARY KEY,
  fruit_id INT NOT NULL,
  packaging_size ENUM('small', 'medium', 'large') NOT NULL,
  available_quantity INT NOT NULL DEFAULT 0,
  unit_selling_price DECIMAL(10, 2) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_stock_fruit_size UNIQUE (fruit_id, packaging_size),
  CONSTRAINT fk_stock_fruit FOREIGN KEY (fruit_id)
    REFERENCES Fruits (fruit_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_stock_available_qty CHECK (available_quantity >= 0),
  CONSTRAINT chk_stock_selling_price CHECK (unit_selling_price > 0)
);

CREATE TABLE Purchases (
  purchase_id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  purchase_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id)
    REFERENCES Suppliers (supplier_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_purchase_total_amount CHECK (total_amount >= 0),
  INDEX idx_purchases_date (purchase_date),
  INDEX idx_purchases_supplier (supplier_id)
);

CREATE TABLE Purchase_details (
  purchase_detail_id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  fruit_id INT NOT NULL,
  packaging_size ENUM('small', 'medium', 'large') NOT NULL,
  quantity INT NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  CONSTRAINT fk_purchase_details_purchase FOREIGN KEY (purchase_id)
    REFERENCES Purchases (purchase_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_purchase_details_fruit FOREIGN KEY (fruit_id)
    REFERENCES Fruits (fruit_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_purchase_detail_qty CHECK (quantity > 0),
  CONSTRAINT chk_purchase_detail_unit_cost CHECK (unit_cost > 0),
  INDEX idx_purchase_details_purchase (purchase_id),
  INDEX idx_purchase_details_fruit_size (fruit_id, packaging_size)
);

CREATE TABLE Sales (
  sale_id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  sale_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  payment_method ENUM('Cash', 'Mobile money', 'Outstanding') NOT NULL DEFAULT 'Cash',
  amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  payment_status ENUM('PAID', 'PARTIALLY_PAID', 'UNPAID') NOT NULL DEFAULT 'UNPAID',
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_vendor FOREIGN KEY (vendor_id)
    REFERENCES Vendors (vendor_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_sale_total_amount CHECK (total_amount >= 0),
  CONSTRAINT chk_sale_amount_paid CHECK (amount_paid >= 0),
  INDEX idx_sales_date (sale_date),
  INDEX idx_sales_vendor (vendor_id),
  INDEX idx_sales_payment_status (payment_status)
);

CREATE TABLE Sales_details (
  sales_detail_id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  fruit_id INT NOT NULL,
  packaging_size ENUM('small', 'medium', 'large') NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  CONSTRAINT fk_sales_details_sale FOREIGN KEY (sale_id)
    REFERENCES Sales (sale_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_sales_details_fruit FOREIGN KEY (fruit_id)
    REFERENCES Fruits (fruit_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_sales_detail_qty CHECK (quantity > 0),
  CONSTRAINT chk_sales_detail_unit_price CHECK (unit_price > 0),
  INDEX idx_sales_details_sale (sale_id),
  INDEX idx_sales_details_fruit_size (fruit_id, packaging_size)
);
