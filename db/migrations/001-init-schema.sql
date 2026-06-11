-- ================================================================
-- PostgreSQL Multi-Tenant Schema with Row Level Security
-- Run: psql -f migrations/001-init-schema.sql
-- ================================================================

-- ================================================================
-- 🔧 EXTENSIONS & TYPES
-- ================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom ENUM Types
CREATE TYPE user_role AS ENUM ('super_admin', 'shop_admin', 'staff', 'manager');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'inactive', 'pending');
CREATE TYPE shop_status AS ENUM ('active', 'suspended', 'inactive', 'trial');
CREATE TYPE shop_plan AS ENUM ('basic', 'premium', 'enterprise');
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'completed', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'upi', 'check');
CREATE TYPE notification_type AS ENUM ('order', 'payment', 'alert', 'info', 'promo');

-- ================================================================
-- 🏢 SHOPS TABLE (TENANTS)
-- ================================================================
CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  
  status shop_status NOT NULL DEFAULT 'trial',
  plan shop_plan NOT NULL DEFAULT 'basic',
  
  owner_id UUID,
  trial_expires_at TIMESTAMP,
  subscription_expires_at TIMESTAMP,
  is_demo BOOLEAN DEFAULT FALSE,
  
  settings JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_email UNIQUE (email)
);

CREATE INDEX idx_shops_status ON shops(status);
CREATE INDEX idx_shops_plan ON shops(plan);
CREATE INDEX idx_shops_owner_id ON shops(owner_id);

-- ================================================================
-- 👥 USERS TABLE
-- ================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  email VARCHAR(255) NOT NULL,
  firebase_uid VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  
  role user_role NOT NULL DEFAULT 'staff',
  status user_status NOT NULL DEFAULT 'active',
  
  last_login_at TIMESTAMP,
  last_login_ip VARCHAR(45),
  
  permissions JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT email_shop_unique UNIQUE (shop_id, email)
);

CREATE INDEX idx_users_shop_id ON users(shop_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_status ON users(shop_id, status);
CREATE INDEX idx_users_role ON users(shop_id, role);

-- ================================================================
-- 📦 CATEGORIES TABLE
-- ================================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT category_name_unique UNIQUE (shop_id, name)
);

CREATE INDEX idx_categories_shop_id ON categories(shop_id);
CREATE INDEX idx_categories_active ON categories(shop_id, is_active);

-- ================================================================
-- 📦 PRODUCTS TABLE
-- ================================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(100),
  barcode VARCHAR(100),
  
  price NUMERIC(12, 2) NOT NULL,
  cost_price NUMERIC(12, 2),
  discount_price NUMERIC(12, 2),
  
  stock INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  
  images JSONB DEFAULT '[]',
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT sku_unique_per_shop UNIQUE (shop_id, sku)
);

CREATE INDEX idx_products_shop_id ON products(shop_id);
CREATE INDEX idx_products_shop_sku ON products(shop_id, sku);
CREATE INDEX idx_products_category ON products(shop_id, category_id);
CREATE INDEX idx_products_active ON products(shop_id, is_active);
CREATE INDEX idx_products_stock ON products(shop_id) WHERE stock <= reorder_level;

-- ================================================================
-- 👤 CUSTOMERS TABLE
-- ================================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  postal_code VARCHAR(20),
  
  loyalty_points INTEGER DEFAULT 0,
  credit_limit NUMERIC(12, 2),
  
  notes TEXT,
  
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_shop_id ON customers(shop_id);
CREATE INDEX idx_customers_email ON customers(shop_id, email);
CREATE INDEX idx_customers_phone ON customers(shop_id, phone);

-- ================================================================
-- 📋 ORDERS TABLE
-- ================================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  order_number VARCHAR(50) NOT NULL,
  
  status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  
  subtotal NUMERIC(12, 2) DEFAULT 0,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL,
  
  notes TEXT,
  
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT order_number_unique UNIQUE (shop_id, order_number)
);

CREATE INDEX idx_orders_shop_id ON orders(shop_id);
CREATE INDEX idx_orders_shop_date ON orders(shop_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(shop_id, status);
CREATE INDEX idx_orders_customer ON orders(shop_id, customer_id);
CREATE INDEX idx_orders_payment_status ON orders(shop_id, payment_status);

-- ================================================================
-- 📦 ORDER_ITEMS TABLE
-- ================================================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL,
  discount NUMERIC(12, 2) DEFAULT 0,
  total_price NUMERIC(12, 2) NOT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_shop_id ON order_items(shop_id);
CREATE INDEX idx_order_items_order_id ON order_items(shop_id, order_id);
CREATE INDEX idx_order_items_product_id ON order_items(shop_id, product_id);

-- ================================================================
-- 💳 PAYMENTS TABLE
-- ================================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  amount NUMERIC(12, 2) NOT NULL,
  method payment_method NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  
  transaction_id VARCHAR(255),
  reference_number VARCHAR(255),
  
  notes TEXT,
  
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_shop_id ON payments(shop_id);
CREATE INDEX idx_payments_order_id ON payments(shop_id, order_id);
CREATE INDEX idx_payments_status ON payments(shop_id, status);
CREATE INDEX idx_payments_created ON payments(shop_id, created_at DESC);

-- ================================================================
-- 🔔 NOTIFICATIONS TABLE
-- ================================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  title VARCHAR(255) NOT NULL,
  message TEXT,
  type notification_type NOT NULL,
  
  data JSONB DEFAULT '{}',
  
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_shop_user ON notifications(shop_id, user_id, created_at DESC);
CREATE INDEX idx_notifications_read ON notifications(shop_id, user_id, is_read);

-- ================================================================
-- 📊 ACTIVITY_LOGS TABLE
-- ================================================================
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  
  old_values JSONB,
  new_values JSONB,
  
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_shop_id ON activity_logs(shop_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(shop_id, user_id, created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(shop_id, entity_type, entity_id);

-- ================================================================
-- 🔐 ROW LEVEL SECURITY (RLS)
-- ================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: Get current user's shop_id from JWT token
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_current_shop_id() RETURNS UUID AS $$
  SELECT nullif(current_setting('app.shop_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('app.is_super_admin', true), 'false')::boolean;
$$ LANGUAGE SQL STABLE;

-- ================================================================
-- PRODUCTS RLS POLICIES
-- ================================================================
CREATE POLICY products_select ON products
  FOR SELECT
  USING (
    shop_id = get_current_shop_id() 
    OR is_super_admin()
  );

CREATE POLICY products_insert ON products
  FOR INSERT
  WITH CHECK (
    shop_id = get_current_shop_id()
    AND (is_super_admin() OR created_by = get_current_user_id())
  );

CREATE POLICY products_update ON products
  FOR UPDATE
  USING (shop_id = get_current_shop_id() OR is_super_admin())
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY products_delete ON products
  FOR DELETE
  USING (shop_id = get_current_shop_id() OR is_super_admin());

-- ================================================================
-- CATEGORIES RLS POLICIES
-- ================================================================
CREATE POLICY categories_select ON categories
  FOR SELECT
  USING (shop_id = get_current_shop_id() OR is_super_admin());

CREATE POLICY categories_insert ON categories
  FOR INSERT
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY categories_update ON categories
  FOR UPDATE
  USING (shop_id = get_current_shop_id() OR is_super_admin())
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY categories_delete ON categories
  FOR DELETE
  USING (shop_id = get_current_shop_id() OR is_super_admin());

-- ================================================================
-- CUSTOMERS RLS POLICIES
-- ================================================================
CREATE POLICY customers_select ON customers
  FOR SELECT
  USING (shop_id = get_current_shop_id() OR is_super_admin());

CREATE POLICY customers_insert ON customers
  FOR INSERT
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY customers_update ON customers
  FOR UPDATE
  USING (shop_id = get_current_shop_id() OR is_super_admin())
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY customers_delete ON customers
  FOR DELETE
  USING (shop_id = get_current_shop_id() OR is_super_admin());

-- ================================================================
-- ORDERS RLS POLICIES
-- ================================================================
CREATE POLICY orders_select ON orders
  FOR SELECT
  USING (shop_id = get_current_shop_id() OR is_super_admin());

CREATE POLICY orders_insert ON orders
  FOR INSERT
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY orders_update ON orders
  FOR UPDATE
  USING (shop_id = get_current_shop_id() OR is_super_admin())
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY orders_delete ON orders
  FOR DELETE
  USING (shop_id = get_current_shop_id() OR is_super_admin());

-- ================================================================
-- ORDER_ITEMS RLS POLICIES
-- ================================================================
CREATE POLICY order_items_select ON order_items
  FOR SELECT
  USING (shop_id = get_current_shop_id() OR is_super_admin());

CREATE POLICY order_items_insert ON order_items
  FOR INSERT
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY order_items_update ON order_items
  FOR UPDATE
  USING (shop_id = get_current_shop_id() OR is_super_admin())
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY order_items_delete ON order_items
  FOR DELETE
  USING (shop_id = get_current_shop_id() OR is_super_admin());

-- ================================================================
-- PAYMENTS RLS POLICIES
-- ================================================================
CREATE POLICY payments_select ON payments
  FOR SELECT
  USING (shop_id = get_current_shop_id() OR is_super_admin());

CREATE POLICY payments_insert ON payments
  FOR INSERT
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY payments_update ON payments
  FOR UPDATE
  USING (shop_id = get_current_shop_id() OR is_super_admin())
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY payments_delete ON payments
  FOR DELETE
  USING (shop_id = get_current_shop_id() OR is_super_admin());

-- ================================================================
-- NOTIFICATIONS RLS POLICIES
-- ================================================================
CREATE POLICY notifications_select ON notifications
  FOR SELECT
  USING (
    shop_id = get_current_shop_id()
    OR (user_id = get_current_user_id())
    OR is_super_admin()
  );

CREATE POLICY notifications_insert ON notifications
  FOR INSERT
  WITH CHECK (shop_id = get_current_shop_id());

CREATE POLICY notifications_update ON notifications
  FOR UPDATE
  USING (shop_id = get_current_shop_id() OR is_super_admin())
  WITH CHECK (shop_id = get_current_shop_id());

-- ================================================================
-- ACTIVITY_LOGS RLS POLICIES
-- ================================================================
CREATE POLICY activity_logs_select ON activity_logs
  FOR SELECT
  USING (shop_id = get_current_shop_id() OR is_super_admin());

CREATE POLICY activity_logs_insert ON activity_logs
  FOR INSERT
  WITH CHECK (shop_id = get_current_shop_id());

-- ================================================================
-- 🔄 TIMESTAMP UPDATE TRIGGER
-- ================================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shops_timestamp BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_products_timestamp BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_categories_timestamp BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_customers_timestamp BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_orders_timestamp BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_payments_timestamp BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_notifications_timestamp BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ================================================================
-- ✅ SCHEMA COMPLETE
-- ================================================================
COMMENT ON SCHEMA public IS 'Multi-tenant POS system with Row Level Security';
