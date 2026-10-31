# Brightloop Subscription Management

Contract-first Subscription Management & Recurring Billing platform built with **Node.js (Express + TypeScript)** and **PostgreSQL 16 (Docker)**.

## Folder Structure

```
brightloop/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/{auth,admin,staff,finance,customer}/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   ├── utils/
│   │   └── App.tsx
│   ├── public/
│   ├── package.json
│   └── .env.example
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── database/{schema,migrations,seed,db.ts}
│   │   ├── modules/{auth,users,customers,products,plans,quotations,subscriptions,invoices,payments,discounts,taxes,billing,reports,portal}/
│   │   ├── middleware/
│   │   ├── jobs/
│   │   ├── queues/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── validators/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── drizzle.config.ts
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── infrastructure/
│   ├── docker-compose.yml
│   ├── postgres/
│   └── redis/
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   └── ARCHITECTURE.md
├── tests/
│   ├── integration/
│   └── e2e/
├── .gitignore
├── README.md
└── package.json
```

## Quick Start (Local Docker PostgreSQL)

1. Start PostgreSQL (and Redis + API) via Docker Compose:
   ```bash
   docker compose -f infrastructure/docker-compose.yml up -d
   ```
2. Seed the database:
   ```bash
   cd backend
   npm run seed
   ```
3. Run the API server locally:
   ```bash
   cd backend
   npm run dev
   ```
4. Run automated integration & E2E tests:
   ```bash
   npm test
   npm run test:e2e
   ```

## Seeded Test Accounts

| Role | Portal | Email | Password |
|---|---|---|---|
| Admin | Staff Console (`/staff/login`) | `admin@brightloop.test` | `Admin@2026!` |
| Staff | Staff Console (`/staff/login`) | `riya@brightloop.test` | `Staff@2026!` |
| Finance | Staff Console (`/staff/login`) | `meera@brightloop.test` | `Finance@2026!` |
| Customer (Acme Ltd) | Customer Site (`/login`) | `billing@acme.test` | `Customer@2026!` |
| Customer (Kite Stores) | Customer Site (`/login`) | `asha@kite.test` | `Customer@2026!` |
