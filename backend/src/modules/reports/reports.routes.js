const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { getTodayIST, daysBetween } = require('../../utils/dates.js');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'staff', 'finance'));

function getDefaultMonthRange() {
  const today = getTodayIST();
  const [y, m] = today.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(
    2,
    '0'
  )}`;
  return { from, to };
}

function scaleMrrFactorSql(col = 'pl.billing_period') {
  return `CASE ${col}
    WHEN 'daily' THEN 365.0 / 12.0
    WHEN 'weekly' THEN 52.0 / 12.0
    WHEN 'monthly' THEN 1.0
    WHEN 'yearly' THEN 1.0 / 12.0
    ELSE 1.0
  END`;
}

// GET /reports/summary
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const defRange = getDefaultMonthRange();
    const from = req.query.from ? String(req.query.from) : defRange.from;
    const to = req.query.to ? String(req.query.to) : defRange.to;
    const planId = req.query.planId ? String(req.query.planId) : null;
    const customerId = req.query.customerId
      ? String(req.query.customerId)
      : null;
    const today = getTodayIST();

    const subFilterConds = [];
    const subFilterParams = [];
    if (planId) {
      subFilterParams.push(planId);
      subFilterConds.push(`s.plan_id = $${subFilterParams.length}`);
    }
    if (customerId) {
      subFilterParams.push(customerId);
      subFilterConds.push(`s.customer_id = $${subFilterParams.length}`);
    }
    const subExtraWhere =
      subFilterConds.length > 0 ? `AND ${subFilterConds.join(' AND ')}` : '';

    const invFilterConds = [];
    const invFilterParams = [];
    if (customerId) {
      invFilterParams.push(customerId);
      invFilterConds.push(`i.customer_id = $${invFilterParams.length}`);
    }
    if (planId) {
      invFilterParams.push(planId);
      invFilterConds.push(
        `EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = i.subscription_id AND s.plan_id = $${invFilterParams.length})`
      );
    }
    const invExtraWhere =
      invFilterConds.length > 0 ? `AND ${invFilterConds.join(' AND ')}` : '';

    const payFilterConds = [];
    const payFilterParams = [];
    if (customerId) {
      payFilterParams.push(customerId);
      payFilterConds.push(`p.customer_id = $${payFilterParams.length}`);
    }
    if (planId) {
      payFilterParams.push(planId);
      payFilterConds.push(
        `EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = p.subscription_id AND s.plan_id = $${payFilterParams.length})`
      );
    }
    const payExtraWhere =
      payFilterConds.length > 0 ? `AND ${payFilterConds.join(' AND ')}` : '';

    const [activeAndMrrRes, newSubsRes, closedSubsRes, payRes, invRes] =
      await Promise.all([
        db.query(
          `SELECT COUNT(*)::int AS active_count,
                  COALESCE(ROUND(SUM(s.recurring_net * (${scaleMrrFactorSql('pl.billing_period')}))), 0) AS mrr
           FROM subscriptions s
           JOIN plans pl ON pl.id = s.plan_id
           WHERE s.status = 'active' ${subExtraWhere}`,
          subFilterParams
        ),
        db.query(
          `SELECT COUNT(*)::int AS cnt
           FROM subscriptions s
           WHERE s.start_date >= $${subFilterParams.length + 1}
             AND s.start_date <= $${subFilterParams.length + 2}
             AND (
               s.status IN ('active', 'paused')
               OR (s.status = 'closed' AND s.close_reason IN ('expired', 'closed_early'))
             )
             ${subExtraWhere}`,
          [...subFilterParams, from, to]
        ),
        db.query(
          `SELECT COUNT(*)::int AS cnt
           FROM subscriptions s
           WHERE s.status = 'closed'
             AND s.close_reason IN ('expired', 'closed_early')
             AND s.closed_at >= ($${subFilterParams.length + 1}::date)
             AND s.closed_at < (($${subFilterParams.length + 2}::date) + INTERVAL '1 day')
             ${subExtraWhere}`,
          [...subFilterParams, from, to]
        ),
        db.query(
          `SELECT COALESCE(SUM(p.amount), 0) AS collected
           FROM payments p
           WHERE p.payment_date >= $${payFilterParams.length + 1}
             AND p.payment_date <= $${payFilterParams.length + 2}
             ${payExtraWhere}`,
          [...payFilterParams, from, to]
        ),
        db.query(
          `SELECT
             COALESCE(SUM(CASE WHEN i.status IN ('confirmed', 'paid') AND i.invoice_date >= $${
               invFilterParams.length + 1
             } AND i.invoice_date <= $${
            invFilterParams.length + 2
          } THEN i.total ELSE 0 END), 0) AS invoiced_amount,
             COALESCE(SUM(CASE WHEN i.status = 'confirmed' THEN i.balance ELSE 0 END), 0) AS outstanding_amount,
             COALESCE(SUM(CASE WHEN i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $${
               invFilterParams.length + 3
             } THEN i.balance ELSE 0 END), 0) AS overdue_amount,
             COUNT(*) FILTER (WHERE i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $${
               invFilterParams.length + 3
             })::int AS overdue_count
           FROM invoices i
           WHERE 1=1 ${invExtraWhere}`,
          [...invFilterParams, from, to, today]
        ),
      ]);

    return res.status(200).json({
      data: {
        range: { from, to },
        activeSubscriptions: Number(activeAndMrrRes.rows[0].active_count || 0),
        newSubscriptions: Number(newSubsRes.rows[0].cnt || 0),
        closedSubscriptions: Number(closedSubsRes.rows[0].cnt || 0),
        mrr: Number(activeAndMrrRes.rows[0].mrr || 0),
        revenueCollected: Number(payRes.rows[0].collected || 0),
        invoicedAmount: Number(invRes.rows[0].invoiced_amount || 0),
        outstandingAmount: Number(invRes.rows[0].outstanding_amount || 0),
        overdueAmount: Number(invRes.rows[0].overdue_amount || 0),
        overdueCount: Number(invRes.rows[0].overdue_count || 0),
      },
    });
  })
);

// GET /reports/revenue-by-month
router.get(
  '/revenue-by-month',
  asyncHandler(async (req, res) => {
    const today = getTodayIST();
    const curMonth = today.slice(0, 7);

    let toMonth = req.query.to ? String(req.query.to).slice(0, 7) : curMonth;
    let fromMonth = req.query.from ? String(req.query.from).slice(0, 7) : null;

    if (!fromMonth) {
      const [y, m] = toMonth.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 - 5, 1));
      fromMonth = `${dt.getUTCFullYear()}-${String(
        dt.getUTCMonth() + 1
      ).padStart(2, '0')}`;
    }

    // Generate list of months (at most 24)
    const months = [];
    const [fy, fm] = fromMonth.split('-').map(Number);
    const [ty, tm] = toMonth.split('-').map(Number);
    let cy = fy;
    let cm = fm;
    while ((cy < ty || (cy === ty && cm <= tm)) && months.length < 24) {
      months.push(`${cy}-${String(cm).padStart(2, '0')}`);
      cm += 1;
      if (cm > 12) {
        cm = 1;
        cy += 1;
      }
    }

    if (months.length === 0) {
      return res.status(200).json({ data: [] });
    }

    const startDate = `${months[0]}-01`;
    const lastMonth = months[months.length - 1];
    const [ly, lm] = lastMonth.split('-').map(Number);
    const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
    const endDate = `${lastMonth}-${String(lastDay).padStart(2, '0')}`;

    const customerId = req.query.customerId
      ? String(req.query.customerId)
      : null;
    const planId = req.query.planId ? String(req.query.planId) : null;

    const invParams = [startDate, endDate];
    let invExtra = '';
    if (customerId) {
      invParams.push(customerId);
      invExtra += ` AND i.customer_id = $${invParams.length}`;
    }
    if (planId) {
      invParams.push(planId);
      invExtra += ` AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = i.subscription_id AND s.plan_id = $${invParams.length})`;
    }

    const payParams = [startDate, endDate];
    let payExtra = '';
    if (customerId) {
      payParams.push(customerId);
      payExtra += ` AND p.customer_id = $${payParams.length}`;
    }
    if (planId) {
      payParams.push(planId);
      payExtra += ` AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = p.subscription_id AND s.plan_id = $${payParams.length})`;
    }

    const [invRes, payRes] = await Promise.all([
      db.query(
        `SELECT SUBSTRING(i.invoice_date FROM 1 FOR 7) AS month,
                COALESCE(SUM(i.total), 0) AS invoiced
         FROM invoices i
         WHERE i.status IN ('confirmed', 'paid')
           AND i.invoice_date >= $1
           AND i.invoice_date <= $2
           ${invExtra}
         GROUP BY SUBSTRING(i.invoice_date FROM 1 FOR 7)`,
        invParams
      ),
      db.query(
        `SELECT SUBSTRING(p.payment_date FROM 1 FOR 7) AS month,
                COALESCE(SUM(p.amount), 0) AS collected
         FROM payments p
         WHERE p.payment_date >= $1
           AND p.payment_date <= $2
           ${payExtra}
         GROUP BY SUBSTRING(p.payment_date FROM 1 FOR 7)`,
        payParams
      ),
    ]);

    const invMap = new Map(
      invRes.rows.map((r) => [r.month, Number(r.invoiced)])
    );
    const payMap = new Map(
      payRes.rows.map((r) => [r.month, Number(r.collected)])
    );

    const data = months.map((m) => ({
      month: m,
      invoiced: invMap.get(m) || 0,
      collected: payMap.get(m) || 0,
    }));

    return res.status(200).json({ data });
  })
);

// GET /reports/subscriptions-by-plan
router.get(
  '/subscriptions-by-plan',
  asyncHandler(async (req, res) => {
    const conds = [`s.status = 'active'`];
    const params = [];

    if (req.query.planId) {
      params.push(String(req.query.planId));
      conds.push(`s.plan_id = $${params.length}`);
    }
    if (req.query.customerId) {
      params.push(String(req.query.customerId));
      conds.push(`s.customer_id = $${params.length}`);
    }

    const rowsRes = await db.query(
      `SELECT pl.id AS plan_id,
              pl.name AS plan_name,
              COUNT(s.id)::int AS count,
              COALESCE(ROUND(SUM(s.recurring_net * (${scaleMrrFactorSql('pl.billing_period')}))), 0) AS mrr
       FROM subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       WHERE ${conds.join(' AND ')}
       GROUP BY pl.id, pl.name, pl.billing_period
       ORDER BY mrr DESC`,
      params
    );

    const data = rowsRes.rows.map((r) => ({
      plan: { id: r.plan_id, name: r.plan_name },
      count: Number(r.count),
      mrr: Number(r.mrr),
    }));

    return res.status(200).json({ data });
  })
);

// GET /reports/aging
router.get(
  '/aging',
  asyncHandler(async (req, res) => {
    const today = getTodayIST();
    const conds = [`i.status = 'confirmed'`, `i.balance > 0`];
    const params = [today]; // $1 = today

    if (req.query.customerId) {
      params.push(String(req.query.customerId));
      conds.push(`i.customer_id = $${params.length}`);
    }
    if (req.query.planId) {
      params.push(String(req.query.planId));
      conds.push(
        `EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = i.subscription_id AND s.plan_id = $${params.length})`
      );
    }

    const resRows = await db.query(
      `SELECT
         CASE
           WHEN i.due_date >= $1 THEN 'current'
           WHEN ($1::date - i.due_date::date) BETWEEN 1 AND 30 THEN '1-30'
           WHEN ($1::date - i.due_date::date) BETWEEN 31 AND 60 THEN '31-60'
           WHEN ($1::date - i.due_date::date) BETWEEN 61 AND 90 THEN '61-90'
           ELSE '90+'
         END AS bucket,
         COUNT(*)::int AS count,
         COALESCE(SUM(i.balance), 0) AS amount
       FROM invoices i
       WHERE ${conds.join(' AND ')}
       GROUP BY 1`,
      params
    );

    const bucketOrder = ['current', '1-30', '31-60', '61-90', '90+'];
    const map = new Map(
      resRows.rows.map((r) => [
        r.bucket,
        { bucket: r.bucket, count: Number(r.count), amount: Number(r.amount) },
      ])
    );

    const data = bucketOrder
      .map((b) => map.get(b) || { bucket: b, count: 0, amount: 0 })
      .filter((b) => b.count > 0 || bucketOrder.includes(b.bucket));

    return res.status(200).json({ data });
  })
);

function escapeCsvCell(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function paiseToRupeesStr(paise) {
  return (Number(paise || 0) / 100).toFixed(2);
}

// GET /reports/export
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const type = req.query.type;
    if (!['invoices', 'payments', 'subscriptions'].includes(type)) {
      throw Errors.validation('Some fields are invalid', [
        {
          field: 'type',
          message: 'type must be invoices, payments or subscriptions',
        },
      ]);
    }

    let csvRows = [];

    if (type === 'invoices') {
      const conds = [];
      const params = [];
      if (req.query.status) {
        params.push(String(req.query.status));
        conds.push(`i.status = $${params.length}`);
      }
      if (req.query.customerId) {
        params.push(String(req.query.customerId));
        conds.push(`i.customer_id = $${params.length}`);
      }
      if (req.query.overdue === 'true') {
        params.push(getTodayIST());
        conds.push(
          `i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $${params.length}`
        );
      }
      const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
      const rowsRes = await db.query(
        `SELECT i.*, c.name AS customer_name, s.number AS subscription_number
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN subscriptions s ON s.id = i.subscription_id
         ${where}
         ORDER BY i.invoice_date DESC`,
        params
      );

      csvRows.push(
        [
          'number',
          'customer',
          'subscription',
          'invoiceDate',
          'dueDate',
          'status',
          'total',
          'amountPaid',
          'balance',
        ].join(',')
      );
      for (const r of rowsRes.rows) {
        csvRows.push(
          [
            r.number,
            r.customer_name || '',
            r.subscription_number || '',
            r.invoice_date,
            r.due_date,
            r.status,
            paiseToRupeesStr(r.total),
            paiseToRupeesStr(r.amount_paid),
            paiseToRupeesStr(r.balance),
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
    } else if (type === 'payments') {
      const conds = [];
      const params = [];
      if (req.query.customerId) {
        params.push(String(req.query.customerId));
        conds.push(`p.customer_id = $${params.length}`);
      }
      if (req.query.method) {
        params.push(String(req.query.method));
        conds.push(`p.method = $${params.length}`);
      }
      const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
      const rowsRes = await db.query(
        `SELECT p.*, i.number AS invoice_number, c.name AS customer_name
         FROM payments p
         LEFT JOIN invoices i ON i.id = p.invoice_id
         LEFT JOIN customers c ON c.id = p.customer_id
         ${where}
         ORDER BY p.payment_date DESC`,
        params
      );

      csvRows.push(
        ['invoice', 'customer', 'paymentDate', 'method', 'amount', 'note'].join(
          ','
        )
      );
      for (const r of rowsRes.rows) {
        csvRows.push(
          [
            r.invoice_number || '',
            r.customer_name || '',
            r.payment_date,
            r.method,
            paiseToRupeesStr(r.amount),
            r.note || '',
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
    } else if (type === 'subscriptions') {
      const conds = [];
      const params = [];
      if (req.query.status) {
        params.push(String(req.query.status));
        conds.push(`s.status = $${params.length}`);
      }
      if (req.query.customerId) {
        params.push(String(req.query.customerId));
        conds.push(`s.customer_id = $${params.length}`);
      }
      if (req.query.planId) {
        params.push(String(req.query.planId));
        conds.push(`s.plan_id = $${params.length}`);
      }
      const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
      const rowsRes = await db.query(
        `SELECT s.*, c.name AS customer_name, pl.name AS plan_name
         FROM subscriptions s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN plans pl ON pl.id = s.plan_id
         ${where}
         ORDER BY s.created_at DESC`,
        params
      );

      csvRows.push(
        [
          'number',
          'customer',
          'plan',
          'status',
          'startDate',
          'expiryDate',
          'nextInvoiceDate',
          'recurringTotal',
        ].join(',')
      );
      for (const r of rowsRes.rows) {
        csvRows.push(
          [
            r.number,
            r.customer_name || '',
            r.plan_name || '',
            r.status,
            r.start_date,
            r.expiry_date,
            r.next_invoice_date || '',
            paiseToRupeesStr(r.recurring_total),
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${type}-export.csv"`
    );
    return res.status(200).send(csvRows.join('\n') + '\n');
  })
);

module.exports = router;



