# Multi-Tenant POS Architecture with PostgreSQL & RLS

## 🏗️ Architecture Overview

### Core Principles
1. **Shop Isolation**: Every table includes `shop_id` as a tenant identifier
2. **Row Level Security**: Database-enforced access control
3. **Immutable Tenant ID**: shop_id cannot be changed from frontend
4. **Zero Trust Backend**: All shop_id values validated server-side
5. **Scalability**: Designed for horizontal scaling with connection pooling

---

## 📊 Database Schema

### Base Table Structure

Every table MUST include:

```sql
shop_id          UUID         NOT NULL REFERENCES shops(id)
created_by       UUID         NOT NULL
created_at       TIMESTAMP    DEFAULT NOW()
updated_at       TIMESTAMP    DEFAULT NOW()
```

### Core Tables

```
shops
├── id (UUID, PRIMARY KEY)
├── name (VARCHAR)
├── status (ENUM: active, suspended, inactive)
├── plan (ENUM: basic, premium, enterprise)
├── trial_expires_at (TIMESTAMP, nullable)
├── owner_id (UUID, FK to users)
├── created_at
├── updated_at

users
├── id (UUID, PRIMARY KEY)
├── email (VARCHAR, UNIQUE)
├── firebase_uid (VARCHAR, UNIQUE)
├── shop_id (UUID, FK to shops)
├── role (ENUM: super_admin, shop_admin, staff)
├── status (ENUM: active, suspended, inactive)
├── permissions (JSONB array)
├── created_at
├── updated_at

products
├── id (UUID, PRIMARY KEY)
├── shop_id (UUID, FK to shops) ← RLS enforced
├── name (VARCHAR)
├── sku (VARCHAR)
├── price (NUMERIC)
├── cost (NUMERIC)
├── stock (INTEGER)
├── category_id (UUID, FK to categories)
├── created_by (UUID)
├── created_at
├── updated_at
├── INDEX: (shop_id, created_at)
├── INDEX: (shop_id, sku)

categories
├── id (UUID, PRIMARY KEY)
├── shop_id (UUID, FK to shops) ← RLS enforced
├── name (VARCHAR)
├── description (TEXT)
├── created_by (UUID)
├── created_at
├── updated_at
├── INDEX: (shop_id)

orders
├── id (UUID, PRIMARY KEY)
├── shop_id (UUID, FK to shops) ← RLS enforced
├── order_number (VARCHAR, UNIQUE per shop)
├── customer_id (UUID, FK to customers)
├── status (ENUM: pending, processing, completed, cancelled)
├── total_amount (NUMERIC)
├── payment_status (ENUM: pending, paid, failed)
├── notes (TEXT)
├── created_by (UUID)
├── created_at
├── updated_at
├── INDEX: (shop_id, created_at DESC)
├── INDEX: (shop_id, status)

order_items
├── id (UUID, PRIMARY KEY)
├── shop_id (UUID, FK to shops) ← RLS enforced
├── order_id (UUID, FK to orders)
├── product_id (UUID, FK to products)
├── quantity (INTEGER)
├── unit_price (NUMERIC)
├── total_price (NUMERIC)
├── created_at
├── INDEX: (shop_id, order_id)

customers
├── id (UUID, PRIMARY KEY)
├── shop_id (UUID, FK to shops) ← RLS enforced
├── name (VARCHAR)
├── email (VARCHAR)
├── phone (VARCHAR)
├── address (TEXT)
├── city (VARCHAR)
├── created_by (UUID)
├── created_at
├── updated_at
├── INDEX: (shop_id, created_at)
├── INDEX: (shop_id, phone)

payments
├── id (UUID, PRIMARY KEY)
├── shop_id (UUID, FK to shops) ← RLS enforced
├── order_id (UUID, FK to orders)
├── amount (NUMERIC)
├── method (ENUM: cash, card, bank_transfer, upi)
├── status (ENUM: pending, success, failed)
├── transaction_id (VARCHAR)
├── created_by (UUID)
├── created_at
├── updated_at
├── INDEX: (shop_id, created_at DESC)

notifications
├── id (UUID, PRIMARY KEY)
├── shop_id (UUID, FK to shops) ← RLS enforced
├── user_id (UUID, FK to users)
├── title (VARCHAR)
├── message (TEXT)
├── type (ENUM: order, payment, alert, info)
├── is_read (BOOLEAN)
├── created_at
├── INDEX: (shop_id, user_id, created_at DESC)

activity_logs
├── id (UUID, PRIMARY KEY)
├── shop_id (UUID, FK to shops) ← RLS enforced
├── user_id (UUID, FK to users)
├── action (VARCHAR)
├── entity_type (VARCHAR)
├── entity_id (UUID)
├── changes (JSONB)
├── ip_address (VARCHAR)
├── created_at
├── INDEX: (shop_id, created_at DESC)
```

---

## 🔒 Row Level Security (RLS)

### RLS Policy Template

```sql
-- Enable RLS on table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their shop's data
CREATE POLICY select_own_shop ON products
  FOR SELECT
  USING (shop_id = current_setting('app.current_shop_id')::uuid);

-- Policy: Users can insert data for their shop
CREATE POLICY insert_own_shop ON products
  FOR INSERT
  WITH CHECK (shop_id = current_setting('app.current_shop_id')::uuid);

-- Policy: Users can update only their shop's data
CREATE POLICY update_own_shop ON products
  FOR UPDATE
  USING (shop_id = current_setting('app.current_shop_id')::uuid)
  WITH CHECK (shop_id = current_setting('app.current_shop_id')::uuid);

-- Policy: Users can delete only their shop's data
CREATE POLICY delete_own_shop ON products
  FOR DELETE
  USING (shop_id = current_setting('app.current_shop_id')::uuid);

-- Super Admin Bypass (optional separate policy)
CREATE POLICY admin_bypass ON products
  FOR ALL
  USING (current_setting('app.is_admin')::boolean = true);
```

---

## 🔐 Authentication Flow

```
Frontend Request with JWT
        ↓
Express Middleware: extractShopIdFromJWT()
        ↓
SET LOCAL app.current_shop_id = 'shop-uuid'
SET LOCAL app.is_admin = 'false'
        ↓
Database Query Executed
        ↓
RLS Policies Applied
        ↓
Only shop's data returned
```

---

## 🛡️ Security Checklist

- [ ] shop_id is set in JWT at login (not modifiable)
- [ ] All database queries use RLS policies
- [ ] Shop ownership validated on backend
- [ ] shop_id not accepted as URL parameter or body
- [ ] All mutations validate shop ownership
- [ ] Firebase UID mapped to PostgreSQL user
- [ ] Suspended shops reject all queries
- [ ] Trial expiry enforced in middleware
- [ ] No realtime listeners on unrelated shops
- [ ] Connection pooling configured
- [ ] Database backups automated
- [ ] Audit logs track all changes

---

## 📈 Optimization Strategies

### 1. Indexing
```sql
CREATE INDEX idx_products_shop ON products(shop_id);
CREATE INDEX idx_orders_shop_date ON orders(shop_id, created_at DESC);
CREATE INDEX idx_customers_shop ON customers(shop_id);
```

### 2. Connection Pooling
- Use PgBouncer or built-in Node.js pool
- Connection pool size: 10-20 per process
- Maximum connections per server: 100

### 3. Query Optimization
- Use EXPLAIN ANALYZE for slow queries
- Batch operations where possible
- Use prepared statements

### 4. Caching Strategy
- Redis for frequently accessed data
- Cache key: `shop:{shop_id}:products`
- TTL: 5-15 minutes based on update frequency

### 5. Scalability Patterns
- Read replicas for reporting queries
- Write master for transactions
- Horizontal scaling via connection pooling
- Microservices per bounded context (Orders, Products, etc.)

---

## 🚀 Implementation Steps

### Phase 1: Database Setup
1. Install PostgreSQL 15+
2. Run migration scripts (see migrations folder)
3. Enable RLS on all tables
4. Create indexes
5. Test RLS policies

### Phase 2: Backend
1. Install `pg` and connection pooling library
2. Implement JWT middleware
3. Add shop_id injection to all queries
4. Create API routes with validation
5. Add activity logging middleware

### Phase 3: Frontend
1. Update API endpoints
2. Remove Firestore listeners (except POS/Notifications)
3. Update authentication context
4. Test shop isolation

### Phase 4: Testing
1. Multi-shop data isolation tests
2. RLS bypass prevention tests
3. Performance benchmarks
4. Load testing (multi-user scenarios)

### Phase 5: Migration
1. Export data from Firebase
2. Transform and load to PostgreSQL
3. Parallel run (Firebase + PostgreSQL)
4. Gradual traffic migration
5. Monitor and rollback capability

---

## 📝 API Response Examples

### Secure Response
```json
{
  "success": true,
  "data": {
    "id": "prod-123",
    "name": "Product Name",
    "price": 99.99,
    "shop_id": "shop-456"
  }
}
```

### Error on Shop Mismatch
```json
{
  "success": false,
  "error": "Unauthorized: You don't have access to this resource",
  "code": "SHOP_MISMATCH"
}
```

---

## ⚡ Performance Benchmarks (Target)

| Operation | Current (Firebase) | Target (PostgreSQL) |
|-----------|-------------------|-------------------|
| List products | 500ms | 50ms |
| Create order | 800ms | 100ms |
| Generate report | 3000ms | 300ms |
| Fetch customers | 1000ms | 100ms |

---

## 🔄 Migration Checklist

- [ ] Schema designed and reviewed
- [ ] RLS policies tested
- [ ] Middleware implemented
- [ ] API routes created
- [ ] Data migration scripts ready
- [ ] Monitoring setup
- [ ] Backup strategy
- [ ] Rollback plan
- [ ] Team trained
- [ ] Documentation updated
