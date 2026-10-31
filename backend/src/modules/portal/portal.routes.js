const express = require('express');
const db = require('../../database/db.js');
const config = require('../../config/index.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const {
  getTodayIST,
  isValidDateStr,
  addDaysStr,
  addBillingPeriod,
  toIsoString,
} = require('../../utils/dates.js');
const { getSubscriptionDetail } = require('../../services/subscription.service.js');
const {
  formatInvoiceListItem,
  getInvoiceDetail,
} = require('../../services/billing.service.js');

const router = express.Router();

router.use(authenticate, requireRole('customer'));

function ensureCustomerId(req) {
  if (!req.user.customerId) {
    throw Errors.notFound('Customer profile not found');
  }
  return req.user.customerId;
}

// GET /portal/summary
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const customerId = ensureCustomerId(req);
    const today = getTodayIST();

    const [activeSubsRes, pendingQuotesRes, invStatsRes, nextSubRes] =
      await Promise.all([
        db.query(
          `SELECT COUNT(*)::int AS cnt FROM subscriptions WHERE customer_id = $1 AND status = 'active'`,
          [customerId]
        ),
        db.query(
          `SELECT s.id, s.number, s.quotation_valid_until, s.recurring_total, pl.name AS plan_name
           FROM subscriptions s
           LEFT JOIN plans pl ON pl.id = s.plan_id
           WHERE s.customer_id = $1 AND s.status = 'quotation'
           ORDER BY s.created_at DESC`,
          [customerId]
        ),
        db.query(
          `SELECT
             COALESCE(SUM(CASE WHEN status = 'confirmed' THEN balance ELSE 0 END), 0) AS outstanding_amount,
             COUNT(*) FILTER (WHERE status = 'confirmed' AND balance > 0 AND due_date < $2)::int AS overdue_count
           FROM invoices
           WHERE customer_id = $1 AND status != 'draft'`,
          [customerId, today]
        ),
        db.query(
          `SELECT number, next_invoice_date, recurring_total
           FROM subscriptions
           WHERE customer_id = $1 AND status = 'active' AND next_invoice_date IS NOT NULL
           ORDER BY next_invoice_date ASC
           LIMIT 1`,
          [customerId]
        ),
      ]);

    const pendingQuotations = pendingQuotesRes.rows.map((r) => ({
      id: r.id,
      number: r.number,
      plan: { name: r.plan_name || '' },
      quotationValidUntil: r.quotation_valid_until || null,
      recurringTotal: Number(r.recurring_total),
    }));

    const nextSub = nextSubRes.rows[0];
    const nextInvoice = nextSub
      ? {
          subscriptionNumber: nextSub.number,
          date: nextSub.next_invoice_date,
          amount: Number(nextSub.recurring_total),
        }
      : null;

    return res.status(200).json({
      data: {
        activeSubscriptions: Number(activeSubsRes.rows[0].cnt || 0),
        pendingQuotations,
        outstandingAmount: Number(invStatsRes.rows[0].outstanding_amount || 0),
        overdueCount: Number(invStatsRes.rows[0].overdue_count || 0),
        nextInvoice,
      },
    });
  })
);

// GET /portal/subscriptions
router.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const customerId = ensureCustomerId(req);
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit || '20', 10) || 20)
    );
    const offset = (page - 1) * limit;

    if (req.query.status === 'draft') {
      return res.status(200).json({
        data: [],
        meta: { page, limit, total: 0, totalPages: 1 },
      });
    }

    const conds = [`s.customer_id = $1`, `s.status != 'draft'`];
    const params = [customerId];

    if (req.query.status) {
      params.push(String(req.query.status));
      conds.push(`s.status = $${params.length}`);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM subscriptions s ${where}`,
      params
    );
    const total = totalRes.rows[0].total;

    const listRes = await db.query(
      `SELECT s.*,
              c.name AS customer_name,
              pl.name AS plan_name,
              pl.billing_period AS plan_billing_period
       FROM subscriptions s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN plans pl ON pl.id = s.plan_id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const data = listRes.rows.map((r) => ({
      id: r.id,
      number: r.number,
      customer: { id: r.customer_id, name: r.customer_name || '' },
      plan: {
        id: r.plan_id,
        name: r.plan_name || '',
        billingPeriod: r.plan_billing_period || 'monthly',
      },
      status: r.status,
      startDate: r.start_date,
      expiryDate: r.expiry_date,
      quotationValidUntil: r.quotation_valid_until || null,
      nextInvoiceDate: r.next_invoice_date || null,
      recurringTotal: Number(r.recurring_total),
    }));

    return res.status(200).json({
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  })
);

async function getOwnedPortalSubscription(subId, customerId) {
  const subRes = await db.query(
    `SELECT s.*, pl.rules AS plan_rules, pl.billing_period
     FROM subscriptions s
     JOIN plans pl ON pl.id = s.plan_id
     WHERE s.id = $1`,
    [subId]
  );
  if (
    subRes.rowCount === 0 ||
    subRes.rows[0].customer_id !== customerId ||
    subRes.rows[0].status === 'draft'
  ) {
    throw Errors.notFound();
  }
  return subRes.rows[0];
}

// GET /portal/subscriptions/:id
router.get(
  '/subscriptions/:id',
  asyncHandler(async (req, res) => {
    const customerId = ensureCustomerId(req);
    await getOwnedPortalSubscription(req.params.id, customerId);
    const detail = await getSubscriptionDetail(req.params.id, 'customer');
    return res.status(200).json({ data: detail });
  })
);

// POST /portal/subscriptions/:id/accept
router.post(
  '/subscriptions/:id/accept',
  asyncHandler(async (req, res) => {
    const customerId = ensureCustomerId(req);
    const sub = await getOwnedPortalSubscription(req.params.id, customerId);

    if (sub.status !== 'quotation') {
      throw Errors.invalidTransition(
        'Only quotations can be accepted'
      );
    }

    const today = getTodayIST();
    if (sub.quotation_valid_until && sub.quotation_valid_until < today) {
      throw Errors.invalidTransition('Quotation has expired');
    }

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    const nowIso = toIsoString(new Date());

    let newStatus = 'confirmed';
    let nextInvoiceDate = sub.next_invoice_date;

    history.unshift({
      at: nowIso,
      by: req.user.id,
      action: 'confirm',
      from: 'quotation',
      to: 'confirmed',
      note: 'Accepted in portal',
    });

    if (sub.start_date <= today) {
      newStatus = 'active';
      nextInvoiceDate = sub.start_date;
      history.unshift({
        at: nowIso,
        by: 'system',
        action: 'activate',
        from: 'confirmed',
        to: 'active',
        note: null,
      });
    }

    await db.query(
      `UPDATE subscriptions
       SET status = $1,
           next_invoice_date = $2,
           history = $3::jsonb,
           updated_at = NOW()
       WHERE id = $4`,
      [newStatus, nextInvoiceDate, JSON.stringify(history), sub.id]
    );

    const detail = await getSubscriptionDetail(sub.id, 'customer');
    return res.status(200).json({ data: detail });
  })
);

// POST /portal/subscriptions/:id/reject
router.post(
  '/subscriptions/:id/reject',
  asyncHandler(async (req, res) => {
    const customerId = ensureCustomerId(req);
    const sub = await getOwnedPortalSubscription(req.params.id, customerId);

    if (sub.status !== 'quotation') {
      throw Errors.invalidTransition('Only quotations can be rejected');
    }

    const today = getTodayIST();
    if (sub.quotation_valid_until && sub.quotation_valid_until < today) {
      throw Errors.invalidTransition('Quotation has expired');
    }

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'reject',
      from: 'quotation',
      to: 'closed',
      note: req.body?.note || 'Rejected in portal',
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'closed',
           close_reason = 'rejected',
           closed_at = NOW(),
           next_invoice_date = NULL,
           history = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(history), sub.id]
    );

    const detail = await getSubscriptionDetail(sub.id, 'customer');
    return res.status(200).json({ data: detail });
  })
);

// Self-service routes behind CUSTOMER_SELF_SERVICE flag
router.post(
  '/subscriptions/:id/pause',
  asyncHandler(async (req, res) => {
    if (!config.customerSelfService) {
      throw Errors.forbidden('Customer self-service is disabled');
    }
    const customerId = ensureCustomerId(req);
    const sub = await getOwnedPortalSubscription(req.params.id, customerId);

    if (sub.status !== 'active') {
      throw Errors.invalidTransition('Only active subscriptions can be paused');
    }
    if (!sub.plan_rules?.pausable) {
      throw Errors.planRule('This plan does not allow pausing');
    }

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'pause',
      from: 'active',
      to: 'paused',
      note: req.body?.note || 'Paused in portal',
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'paused', paused_at = NOW(), history = $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(history), sub.id]
    );

    const detail = await getSubscriptionDetail(sub.id, 'customer');
    return res.status(200).json({ data: detail });
  })
);

router.post(
  '/subscriptions/:id/resume',
  asyncHandler(async (req, res) => {
    if (!config.customerSelfService) {
      throw Errors.forbidden('Customer self-service is disabled');
    }
    const customerId = ensureCustomerId(req);
    const sub = await getOwnedPortalSubscription(req.params.id, customerId);

    if (sub.status !== 'paused') {
      throw Errors.invalidTransition('Only paused subscriptions can be resumed');
    }

    const today = getTodayIST();
    const oldNext = sub.next_invoice_date || today;
    const newNextInvoiceDate = oldNext > today ? oldNext : today;

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'resume',
      from: 'paused',
      to: 'active',
      note: req.body?.note || 'Resumed in portal',
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'active', paused_at = NULL, next_invoice_date = $1, history = $2::jsonb, updated_at = NOW()
       WHERE id = $3`,
      [newNextInvoiceDate, JSON.stringify(history), sub.id]
    );

    const detail = await getSubscriptionDetail(sub.id, 'customer');
    return res.status(200).json({ data: detail });
  })
);

router.post(
  '/subscriptions/:id/renew',
  asyncHandler(async (req, res) => {
    if (!config.customerSelfService) {
      throw Errors.forbidden('Customer self-service is disabled');
    }
    const customerId = ensureCustomerId(req);
    const sub = await getOwnedPortalSubscription(req.params.id, customerId);

    if (!['active', 'paused'].includes(sub.status)) {
      throw Errors.invalidTransition(
        'Only active or paused subscriptions can be renewed'
      );
    }
    if (!sub.plan_rules?.renewable) {
      throw Errors.planRule('This plan does not allow renewal');
    }

    let newExpiryDate;
    if (req.body?.newExpiryDate) {
      if (
        !isValidDateStr(req.body.newExpiryDate) ||
        req.body.newExpiryDate <= sub.expiry_date
      ) {
        throw Errors.validation('Some fields are invalid', [
          {
            field: 'newExpiryDate',
            message: 'newExpiryDate must be YYYY-MM-DD and after expiryDate',
          },
        ]);
      }
      newExpiryDate = req.body.newExpiryDate;
    } else {
      const nextTermStart = addDaysStr(sub.expiry_date, 1);
      newExpiryDate = addDaysStr(
        addBillingPeriod(nextTermStart, 'yearly', 1),
        -1
      );
    }

    const today = getTodayIST();
    const isExpired = newExpiryDate < today;

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'renew',
      from: sub.status,
      to: sub.status,
      note: `Renewed in portal until ${newExpiryDate}`,
    });

    await db.query(
      `UPDATE subscriptions
       SET expiry_date = $1, is_expired = $2, history = $3::jsonb, updated_at = NOW()
       WHERE id = $4`,
      [newExpiryDate, isExpired, JSON.stringify(history), sub.id]
    );

    const detail = await getSubscriptionDetail(sub.id, 'customer');
    return res.status(200).json({ data: detail });
  })
);

router.post(
  '/subscriptions/:id/close',
  asyncHandler(async (req, res) => {
    if (!config.customerSelfService) {
      throw Errors.forbidden('Customer self-service is disabled');
    }
    const customerId = ensureCustomerId(req);
    const sub = await getOwnedPortalSubscription(req.params.id, customerId);

    if (!['active', 'paused'].includes(sub.status)) {
      throw Errors.invalidTransition(
        'Only active or paused subscriptions can be closed'
      );
    }

    const today = getTodayIST();
    const pastExpiry = sub.expiry_date < today;
    if (!sub.plan_rules?.closable && !pastExpiry) {
      throw Errors.planRule(
        'This plan does not allow closing early before expiryDate'
      );
    }

    const closeReason = pastExpiry ? 'expired' : 'closed_early';
    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'close',
      from: sub.status,
      to: 'closed',
      note: req.body?.note || 'Closed in portal',
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'closed', close_reason = $1, closed_at = NOW(), next_invoice_date = NULL, history = $2::jsonb, updated_at = NOW()
       WHERE id = $3`,
      [closeReason, JSON.stringify(history), sub.id]
    );

    const detail = await getSubscriptionDetail(sub.id, 'customer');
    return res.status(200).json({ data: detail });
  })
);

// GET /portal/invoices
router.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const customerId = ensureCustomerId(req);
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit || '20', 10) || 20)
    );
    const offset = (page - 1) * limit;
    const today = getTodayIST();

    if (req.query.status === 'draft') {
      return res.status(200).json({
        data: [],
        meta: { page, limit, total: 0, totalPages: 1 },
      });
    }

    const conds = [`i.customer_id = $1`, `i.status != 'draft'`];
    const params = [customerId];

    if (req.query.status) {
      params.push(String(req.query.status));
      conds.push(`i.status = $${params.length}`);
    }
    if (req.query.unpaid === 'true' || req.query.unpaid === true) {
      conds.push(`(i.status = 'confirmed' AND i.balance > 0)`);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM invoices i ${where}`,
      params
    );
    const total = totalRes.rows[0].total;

    const listRes = await db.query(
      `SELECT i.*,
              c.name AS customer_name,
              s.number AS subscription_number
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN subscriptions s ON s.id = i.subscription_id
       ${where}
       ORDER BY i.invoice_date DESC, i.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      data: listRes.rows.map((r) => formatInvoiceListItem(r, today)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  })
);

// GET /portal/invoices/:id
router.get(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    const customerId = ensureCustomerId(req);
    const invRes = await db.query(
      `SELECT id, customer_id, status FROM invoices WHERE id = $1`,
      [req.params.id]
    );
    if (
      invRes.rowCount === 0 ||
      invRes.rows[0].customer_id !== customerId ||
      invRes.rows[0].status === 'draft'
    ) {
      throw Errors.notFound();
    }

    const detail = await getInvoiceDetail(req.params.id, 'customer');
    return res.status(200).json({ data: detail });
  })
);

module.exports = router;



