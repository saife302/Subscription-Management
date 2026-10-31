CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'finance', 'customer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_changed_at TIMESTAMPTZ,
  created_via TEXT NOT NULL CHECK (created_via IN ('signup', 'admin', 'import', 'seed')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_id TEXT,
  last_login_at TIMESTAMPTZ,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  tax_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('service', 'addon', 'physical')),
  sales_price BIGINT NOT NULL DEFAULT 0,
  cost_price BIGINT NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);
CREATE INDEX IF NOT EXISTS idx_products_active_type ON products (is_active, type);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  price BIGINT NOT NULL,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('daily', 'weekly', 'monthly', 'yearly')),
  min_quantity INTEGER NOT NULL CHECK (min_quantity >= 1),
  available_from TEXT NOT NULL,
  available_until TEXT,
  rules JSONB NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_active_from ON plans (is_active, available_from);

CREATE TABLE IF NOT EXISTS quotation_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  validity_days INTEGER NOT NULL DEFAULT 14,
  payment_term_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_term_days IN (0, 15, 30, 45)),
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taxes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  rate NUMERIC(12, 2) NOT NULL,
  applies_to JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value NUMERIC(12, 2) NOT NULL,
  min_purchase_amount BIGINT,
  min_quantity INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  applies_to JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discounts_active_dates ON discounts (is_active, start_date, end_date);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  template_id TEXT REFERENCES quotation_templates(id) ON DELETE SET NULL,
  salesperson_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed')),
  start_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  is_expired BOOLEAN NOT NULL DEFAULT FALSE,
  quotation_valid_until TEXT,
  payment_term_days INTEGER NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_invoice_date TEXT,
  recurring_total BIGINT NOT NULL DEFAULT 0,
  recurring_net BIGINT NOT NULL DEFAULT 0,
  paused_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  close_reason TEXT CHECK (close_reason IS NULL OR close_reason IN ('expired', 'closed_early', 'cancelled', 'rejected', 'quotation_expired')),
  notes TEXT NOT NULL DEFAULT '',
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_status_next_inv ON subscriptions (status, next_invoice_date);
CREATE INDEX IF NOT EXISTS idx_subs_customer_status ON subscriptions (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_plan_status ON subscriptions (plan_id, status);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_snapshot JSONB NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'paid', 'cancelled')),
  is_void BOOLEAN NOT NULL DEFAULT FALSE,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  order_discount JSONB,
  untaxed_amount BIGINT NOT NULL DEFAULT 0,
  discount_total BIGINT NOT NULL DEFAULT 0,
  tax_total BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  amount_paid BIGINT NOT NULL DEFAULT 0,
  balance BIGINT NOT NULL DEFAULT 0,
  applied_discount_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ,
  sent_count INTEGER NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_sub_period_active ON invoices (subscription_id, period_start) WHERE is_void = FALSE;
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices (status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON invoices (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices (invoice_date);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
  method TEXT NOT NULL CHECK (method IN ('bank_transfer', 'card', 'cash', 'cheque', 'upi', 'other')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id);

CREATE TABLE IF NOT EXISTS counters (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS billing_runs (
  id TEXT PRIMARY KEY,
  as_of_date TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL,
  lifecycle JSONB NOT NULL,
  due_subscriptions INTEGER NOT NULL,
  created INTEGER NOT NULL,
  skipped_already_invoiced INTEGER NOT NULL,
  failed JSONB NOT NULL,
  invoice_ids JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
