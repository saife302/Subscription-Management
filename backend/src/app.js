const express = require('express');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');
const config = require('./config/index.js');
const { AppError } = require('./utils/errors.js');

const healthRoutes = require('./modules/auth/health.routes.js');
const authRoutes = require('./modules/auth/auth.routes.js');
const usersRoutes = require('./modules/users/users.routes.js');
const productsRoutes = require('./modules/products/products.routes.js');
const plansRoutes = require('./modules/plans/plans.routes.js');
const quotationsRoutes = require('./modules/quotations/quotations.routes.js');
const taxesRoutes = require('./modules/taxes/taxes.routes.js');
const discountsRoutes = require('./modules/discounts/discounts.routes.js');
const customersRoutes = require('./modules/customers/customers.routes.js');
const subscriptionsRoutes = require('./modules/subscriptions/subscriptions.routes.js');
const invoicesRoutes = require('./modules/invoices/invoices.routes.js');
const billingRoutes = require('./modules/billing/billing.routes.js');
const paymentsRoutes = require('./modules/payments/payments.routes.js');
const reportsRoutes = require('./modules/reports/reports.routes.js');
const portalRoutes = require('./modules/portal/portal.routes.js');

const app = express();

app.set('trust proxy', true);
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = config.corsOrigins;
      if (allowed.includes('*') || allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

if (process.env.NODE_ENV !== 'test') {
  app.use(
    pinoHttp({
      genReqId: (req) => req.id,
      redact: [
        'req.headers.authorization',
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.temporaryPassword',
        'req.body.token',
      ],
    })
  );
}

app.use(express.json({ limit: '2mb' }));

// Root status endpoint
app.get('/', (_req, res) => {
  return res.status(200).json({
    service: 'SubNex Subscription & Billing API',
    status: 'running',
    apiBase: '/api/v1',
    health: '/api/v1/health',
    meta: '/api/v1/meta',
  });
});

// Mount API v1 routes
app.use('/api/v1', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/plans', plansRoutes);
app.use('/api/v1/quotation-templates', quotationsRoutes);
app.use('/api/v1/taxes', taxesRoutes);
app.use('/api/v1/discounts', discountsRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/subscriptions', subscriptionsRoutes);
app.use('/api/v1/invoices', invoicesRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/portal', portalRoutes);

// 404 handler
app.use((_req, res) => {
  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// Central error handler
app.use((err, req, res, _next) => {
  if (err instanceof AppError) {
    const errBody = {
      code: err.code,
      message: err.message,
    };
    if (err.details !== undefined) {
      errBody.details = err.details;
    }
    return res.status(err.httpStatus).json({ error: errBody });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON payload',
      },
    });
  }

  console.error(`[Error][reqId=${req.id}]`, err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'An unexpected error occurred',
      requestId: req.id,
    },
  });
});

module.exports = app;


