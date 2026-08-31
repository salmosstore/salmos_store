PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS size_guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT NOT NULL DEFAULT '',
  meaning_text TEXT NOT NULL DEFAULT '',
  verse_text TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  compare_at_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','hidden')),
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 0,
  is_bestseller INTEGER NOT NULL DEFAULT 0,
  weight_grams INTEGER NOT NULL DEFAULT 0,
  height_cm REAL NOT NULL DEFAULT 0,
  width_cm REAL NOT NULL DEFAULT 0,
  depth_cm REAL NOT NULL DEFAULT 0,
  size_guide_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(category_id) REFERENCES categories(id),
  FOREIGN KEY(size_guide_id) REFERENCES size_guides(id)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('percent','fixed')),
  value INTEGER NOT NULL,
  min_order_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','rejected','refunded','cancelled')),
  fulfillment_status TEXT NOT NULL DEFAULT 'new' CHECK(fulfillment_status IN ('new','preparing','ready','on_the_way','delivered','cancelled')),
  shipping_method TEXT NOT NULL CHECK(shipping_method IN ('moto','correo','pickup')),
  shipping_cost_cents INTEGER NOT NULL DEFAULT 0,
  shipping_actual_cost_cents INTEGER NOT NULL DEFAULT 0,
  shipping_distance_km REAL,
  shipping_address_json TEXT,
  shipping_lat REAL,
  shipping_lng REAL,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  payment_fee_cents INTEGER NOT NULL DEFAULT 0,
  coupon_code TEXT,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  tracking_number TEXT,
  notes TEXT NOT NULL DEFAULT '',
  reservation_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  variant_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status_type TEXT NOT NULL CHECK(status_type IN ('payment','fulfillment')),
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('expense','investment','income')),
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  occurred_at TEXT NOT NULL,
  order_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_finance_date ON finance_movements(occurred_at);

-- CUENTAS DE CLIENTES (Google / Firebase Auth)
CREATE TABLE IF NOT EXISTS customer_accounts (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_favorites (
  uid TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (uid, product_id),
  FOREIGN KEY(uid) REFERENCES customer_accounts(uid) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_cart_items (
  uid TEXT NOT NULL,
  variant_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (uid, variant_id),
  FOREIGN KEY(uid) REFERENCES customer_accounts(uid) ON DELETE CASCADE,
  FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Casa',
  recipient_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  formatted_address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(uid) REFERENCES customer_accounts(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_orders (
  uid TEXT NOT NULL,
  order_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (uid, order_id),
  FOREIGN KEY(uid) REFERENCES customer_accounts(uid) ON DELETE CASCADE,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_uid ON customer_favorites(uid);
CREATE INDEX IF NOT EXISTS idx_customer_cart_uid ON customer_cart_items(uid);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_uid ON customer_addresses(uid);
CREATE INDEX IF NOT EXISTS idx_customer_orders_uid ON customer_orders(uid);

