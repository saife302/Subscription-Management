# SubNex – Subscription Management System

A full-stack subscription management platform designed to simplify subscription lifecycle management, quotations, invoicing, payment tracking and customer self-service.

## Live Demo

- **Frontend:** [https://subnex-sigma.vercel.app/portal](https://subnex-sigma.vercel.app/portal)
- **Backend API:** [https://subnex-backend.onrender.com](https://subnex-backend.onrender.com)

## Overview

SubNex is a subscription management platform that helps businesses manage their customers, products, subscription plans, quotations, invoices and payments through a centralized system.

The platform provides separate access for administrators, staff, finance teams and customers, allowing each role to perform its designated operations.

## Features

### Authentication and User Management
- Customer registration and login.
- JWT-based authentication.
- Password reset functionality.
- Role-based access control.
- Admin-managed staff accounts.

### Product and Plan Management
- Create and manage products.
- Configure product variants.
- Create subscription plans.
- Support daily, weekly, monthly and yearly billing cycles.
- Manage quotation templates.

### Subscription Management
- Create and manage subscriptions.
- Manage quotation and confirmation workflows.
- Track subscription lifecycle statuses.
- Support subscription pausing and resumption.
- Handle renewals and subscription closure.

### Quotation and Invoicing
- Generate quotations for customers.
- Convert confirmed quotations into subscriptions.
- Generate invoices for subscriptions.
- Apply taxes and discounts.
- Track invoice payment status.

### Payment Management
- Record customer payments.
- Track outstanding balances.
- Monitor overdue invoices.
- Maintain payment records.

### Customer Portal
- Customer-specific dashboard.
- View subscription details.
- Access quotations and invoices.
- Track payment information.
- Manage customer account information.

### Analytics and Reporting
- Monitor active subscriptions.
- Track monthly recurring revenue (MRR).
- Track annual recurring revenue (ARR).
- Monitor collected revenue.
- View outstanding and overdue invoices.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Authentication | JSON Web Tokens (JWT) |
| Validation | Zod |
| Email Service | Brevo |
| Caching / Queue | Redis Cloud |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| Database Hosting | Neon PostgreSQL |

## Architecture

```text
                  USERS
                    |
                    v
          React Frontend (Vercel)
                    |
               HTTPS / REST
                    |
                    v
          Node.js + Express API
                 (Render)
                    |
          +---------+---------+
          |         |         |
          v         v         v
       Drizzle    Brevo     Redis
          |
          v
     PostgreSQL
        (Neon)
```

## Project Structure

```text
Subscription-Management/
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   └── utils/
│   ├── package.json
│   └── .env.example
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── database/
│   │   ├── modules/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── jobs/
│   │   ├── queues/
│   │   ├── validators/
│   │   └── server.ts
│   ├── drizzle.config.js
│   ├── package.json
│   └── .env.example
│
└── README.md
```

*Note: The directory structure above represents the intended organization. Adjust individual paths to match the actual repository.*

## Getting Started

### Prerequisites

Make sure you have installed:

- Node.js (LTS recommended)
- npm
- Git
- PostgreSQL-compatible Neon database
- Redis Cloud account (if using Redis features)

### 1. Clone the Repository

```bash
git clone https://github.com/saife302/Subscription-Management.git

cd Subscription-Management
```

### 2. Backend Setup

```bash
cd backend

npm install
```

Create a `.env` file inside the backend directory.

```env
NODE_ENV=development
PORT=4000

DATABASE_URL=your_neon_database_url

JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRES_IN=7d

EMAIL_PROVIDER=console
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=SubNex
BREVO_TEMPLATE_RESET_ID=

WEB_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
```

Add any additional environment variables required by your backend configuration.

### 3. Database Migration

Run Drizzle migrations:

```bash
npx drizzle-kit migrate
```

This applies the existing database migrations to your configured PostgreSQL database.

### 4. Start Backend

```bash
npm start
```

The backend runs on:

```text
http://localhost:4000
```

### 5. Frontend Setup

Open another terminal:

```bash
cd frontend

npm install
```

Create a `.env` file inside the frontend directory:

```env
VITE_API_URL=http://localhost:4000/api/v1
```

Start the frontend:

```bash
npm run dev
```

The Vite development server will display its local URL in the terminal.

## Environment Variables

### Backend

| Variable | Description |
|---|---|
| NODE_ENV | Application environment |
| PORT | Backend server port |
| DATABASE_URL | Neon PostgreSQL connection string |
| JWT_SECRET | JWT signing secret |
| JWT_EXPIRES_IN | Token expiration |
| EMAIL_PROVIDER | Email provider selection |
| BREVO_API_KEY | Brevo API key |
| BREVO_SENDER_EMAIL | Verified sender email |
| BREVO_SENDER_NAME | Sender display name |
| WEB_URL | Frontend application URL |
| CORS_ORIGINS | Allowed frontend origins |

### Frontend

| Variable | Description |
|---|---|
| VITE_API_URL | Backend API base URL |

Never commit `.env` files, database passwords, JWT secrets or API keys to GitHub.

## Deployment

SubNex is deployed using the following services:

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend | Render |
| Database | Neon PostgreSQL |
| Email | Brevo |
| Cache / Queue | Redis Cloud |

### Production URLs

```text
Frontend:
https://subnex-sigma.vercel.app

Customer Portal:
https://subnex-sigma.vercel.app/portal

Backend:
https://subnex-backend.onrender.com
```

Configure the production backend environment variables with the deployed frontend domain:

```env
NODE_ENV=production
WEB_URL=https://subnex-sigma.vercel.app
CORS_ORIGINS=https://subnex-sigma.vercel.app
```

Set the frontend API variable in Vercel:

```env
VITE_API_URL=https://subnex-backend.onrender.com/api/v1
```

After changing environment variables, redeploy the corresponding service.

## Security Considerations

- Passwords should be securely hashed before storage.
- JWT secrets must remain on the backend.
- Role-based permissions must be enforced server-side.
- Customer data must be scoped to the authenticated customer.
- Validate incoming API requests.
- Use environment variables for sensitive credentials.
- Use HTTPS for production communication.
- Restrict CORS to trusted frontend origins.

## Future Improvements

- Online payment gateway integration.
- Advanced subscription analytics.
- Automated billing and renewal workflows.
- Improved notification and reminder system.
- More detailed financial reports.
- Enhanced audit logging.
- Performance optimization for large datasets.

## Author

**Saif Ahmad**

GitHub: [@saife302](https://github.com/saife302)

---

**SubNex – Simplifying Subscription Management.**