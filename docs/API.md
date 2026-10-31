# Brightloop API Documentation (v1)

Base URL: `http://localhost:4000/api/v1`

## Conventions
- **Authentication**: `Authorization: Bearer <token>` on all routes except `/health`, `/auth/customer/signup`, `/auth/customer/login`, `/auth/staff/login`, `/auth/forgot-password`, and `/auth/reset-password`.
- **Roles**: `admin`, `staff`, `finance`, `customer`.
- **Money**: Integer paise (`456000` = ₹4,560.00). Single currency: `INR`.
- **Dates**: Calendar dates as `"YYYY-MM-DD"` in `Asia/Kolkata` (IST). Timestamps as ISO UTC `"2026-10-31T09:30:00Z"`.

## Endpoints Summary

### 1. Health & Meta
- `GET /health` - Public health check (`{ status: "ok", db: "ok", time: "..." }`)
- `GET /meta` - Dropdown enums & company metadata

### 2. Auth (`/auth`)
- `POST /auth/customer/signup` - Customer registration (links existing customer record if matching email)
- `POST /auth/customer/login` - Customer portal login (`role = customer` only)
- `POST /auth/staff/login` - Staff console login (`admin`, `staff`, `finance` only)
- `GET /auth/me` - Current user profile (+ embedded customer record for customers)
- `PATCH /auth/me` - Update profile
- `POST /auth/change-password` - Change password & clear `mustChangePassword`
- `POST /auth/forgot-password` - Send password reset link via Brevo (or console in dev)
- `POST /auth/reset-password` - Reset password using one-time token

### 3. Users (`/users` - Admin only)
- `GET /users` - List users (`role`, `status`, `search`)
- `POST /users` - Create staff/finance/admin user with temporary password
- `POST /users/import?dryRun=true|false` - All-or-nothing CSV bulk user import
- `GET /users/import/template` - Sample CSV download
- `PATCH /users/:id` - Update user name, role, status (enforces `LAST_ADMIN`)
- `POST /users/:id/reset-password` - Issue new temporary password

### 4. Catalog (`/products`, `/plans`, `/quotation-templates`)
- `GET|POST|PATCH|DELETE /products` - Product & variant catalog
- `GET|POST|PATCH|DELETE /plans` - Recurring billing plans & rules (`autoClose`, `closable`, `pausable`, `renewable`)
- `GET|POST|PATCH|DELETE /quotation-templates` - Reusable quotation templates

### 5. Admin Config (`/taxes`, `/discounts`)
- `GET|POST|PATCH|DELETE /taxes` - Tax rules (`percentage` or `fixed`)
- `GET|POST|PATCH /discounts` & `POST /discounts/:id/stop` - Product & subscription discounts

### 6. Customers (`/customers`)
- `GET|POST|PATCH|DELETE /customers` - Customer records with aggregated `stats` (`activeSubscriptions`, `outstandingAmount`, `overdueAmount`, `paidToDate`)

### 7. Subscriptions (`/subscriptions`)
- `GET /subscriptions` - Paginated list with `meta.statusCounts`
- `POST /subscriptions` - Create draft from template or scratch
- `POST /subscriptions/preview` - Live pricing preview without saving
- `GET /subscriptions/:id` - Full detail with `lines`, `totals`, `allowedActions`, `invoiceSummary`, `history`
- `PATCH /subscriptions/:id` - Status-aware editing
- `DELETE /subscriptions/:id` - Delete draft subscription
- Actions: `/send`, `/confirm`, `/activate`, `/pause`, `/resume`, `/renew`, `/close`, `/cancel`, `/invoices`

### 8. Billing & Invoices (`/billing`, `/invoices`)
- `POST /billing/run` - Execute or preview (`dryRun: true`) lifecycle transitions + catch-up invoicing
- `GET /billing/last-run` - Result of most recent billing run
- `GET /invoices`, `GET /invoices/:id`, `PATCH /invoices/:id`
- Actions: `POST /invoices/:id/confirm`, `/cancel`, `/send`, `/bulk/confirm`, `/bulk/send`

### 9. Payments (`/payments`)
- `GET /payments` - Paginated list with `meta.totalAmount`
- `POST /payments` - Record payment in ACID transaction (prevents `OVERPAYMENT`, marks invoice `paid` at 0 balance)
- `GET /payments/:id`
- `DELETE /payments/:id` - Admin reversal of mistaken payment

### 10. Reports (`/reports`)
- `GET /reports/summary`
- `GET /reports/revenue-by-month`
- `GET /reports/subscriptions-by-plan`
- `GET /reports/aging`
- `GET /reports/export?type=invoices|payments|subscriptions`

### 11. Customer Portal (`/portal` - Customer only)
- `GET /portal/summary`
- `GET /portal/subscriptions`, `GET /portal/subscriptions/:id`
- `POST /portal/subscriptions/:id/accept`, `/reject`, `/pause`, `/resume`, `/renew`, `/close`
- `GET /portal/invoices`, `GET /portal/invoices/:id`
