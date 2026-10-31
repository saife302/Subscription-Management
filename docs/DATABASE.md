# Database Architecture (PostgreSQL)

Brightloop uses **PostgreSQL 16** with strict relational integrity, JSONB snapshots for immutable invoice/subscription lines, and ACID transactions.

## Tables
1. `users` - All four roles (`admin`, `staff`, `finance`, `customer`), bcrypt password hashes, temporary password flags, and SHA-256 reset tokens.
2. `customers` - Billed businesses/individuals (`billing_address` JSONB, GSTIN `tax_id`, optional link to portal `user_id`).
3. `products` - Catalog items (`service`, `addon`, `physical`) with embedded `variants` JSONB (`{ id, attribute, value, extraPrice }`).
4. `plans` - Recurring billing terms (`daily`, `weekly`, `monthly`, `yearly`), `min_quantity`, availability dates, and `rules` JSONB (`autoClose`, `closable`, `pausable`, `renewable`).
5. `quotation_templates` - Pre-configured plan + line bundles.
6. `taxes` - Percentage or fixed paise taxes (`applies_to` JSONB: `all`, `productTypes`, `products`).
7. `discounts` - Percentage or fixed paise discounts (`applies_to` JSONB: `products`, `subscription`) with atomic `used_count` tracking against `usage_limit`.
8. `subscriptions` - Full lifecycle (`draft` -> `quotation` -> `confirmed` -> `active` / `paused` -> `closed`), `next_invoice_date` pointer, precomputed `recurring_total` and `recurring_net`, and audit `history` JSONB.
9. `invoices` - Snapshot of customer details, priced lines, discounts, taxes, `amount_paid`, and `balance`.
   - Protected against duplicate period billing by partial unique index:
     `CREATE UNIQUE INDEX idx_invoices_sub_period_active ON invoices (subscription_id, period_start) WHERE is_void = FALSE;`
10. `payments` - Recorded payments linked to `invoices`, `customers`, and `subscriptions`.
11. `counters` - Atomic sequential human number generator (`SUB/2026/0042`, `INV/2026/0310`).
12. `billing_runs` - Execution logs for nightly and manual billing runs.
