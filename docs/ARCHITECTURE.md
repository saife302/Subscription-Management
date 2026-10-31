# System Architecture

## Overview
- **Backend**: Node.js (Express + TypeScript) in `backend/`
- **Database**: PostgreSQL 16 in Docker (`infrastructure/docker-compose.yml`)
- **Email Service**: Brevo Transactional Email API (`https://api.brevo.com/v3/smtp/email`) with local `console` provider fallback
- **Background Jobs**: `node-cron` scheduled in `Asia/Kolkata` timezone (`30 0 * * *`)

## Key Guarantees
1. **Single Pricing Engine (`src/utils/pricing.ts`)**: Used identically across quote preview, subscription detail, manual invoicing, and nightly billing runs.
2. **Idempotent Billing Transactions (`src/services/billing.service.ts`)**: Each subscription period is billed inside a PostgreSQL transaction that atomically reserves discount usage, increments the yearly invoice sequence, inserts the draft invoice, and advances `next_invoice_date`.
3. **Concurrency-Safe Payments (`src/modules/payments/payments.routes.ts`)**: Conditional `UPDATE invoices ... WHERE status = 'confirmed' AND balance >= $amount` inside a transaction prevents overpayments or race conditions.
