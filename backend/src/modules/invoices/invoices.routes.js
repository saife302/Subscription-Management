const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { getTodayIST, isValidDateStr } = require('../../utils/dates.js');
const { sendInvoice } = require('../../services/mailer.service.js');
const {
  formatInvoiceListItem,
  getInvoiceDetail,
} = require('../../services/billing.service.js');

const router = express.Router();

router.use(authenticate);

async function confirmSingleInvoice(invoiceId) {
  const invRes = await db.query(`SELECT * FROM invoices WHERE id = $1`, [
    invoiceId,
  ]);
  if (invRes.rowCount === 0) {
    throw Errors.notFound('Invoice not found');
  }
  const inv = invRes.rows[0];
  if (inv.status !== 'draft') {
    throw Errors.invalidTransition(
      `Invoice is ${inv.status}; only draft invoices can be confirmed`
    );
  }
  await db.query(
    `UPDATE invoices
     SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [invoiceId]
  );
}

async function sendSingleInvoice(invoiceId) {
  const invRes = await db.query(`SELECT * FROM invoices WHERE id = $1`, [
    invoiceId,
  ]);
  if (invRes.rowCount === 0) {
    throw Errors.notFound('Invoice not found');
  }
  const inv = invRes.rows[0];
  if (!['confirmed', 'paid'].includes(inv.status)) {
    throw Errors.invalidTransition(
      `Invoice is ${inv.status}; only confirmed or paid invoices can be sent`
    );
  }

  const custRes = await db.query(`SELECT * FROM customers WHERE id = $1`, [
    inv.customer_id,
  ]);
  const customer = custRes.rows[0];
  const email = customer?.email || inv.customer_snapshot?.email;
  const name = customer?.name || inv.customer_snapshot?.name || 'Customer';

  if (!email) {
    throw Errors.validation('Customer does not have an email address');
  }

  await sendInvoice({
    email,
    name,
    invoiceNumber: inv.number,
    dueDate: inv.due_date,
    totalPaise: Number(inv.total),
    balancePaise: Number(inv.balance),
  });

  await db.query(
    `UPDATE invoices
     SET sent_at = NOW(), sent_count = sent_count + 1, updated_at = NOW()
     WHERE id = $1`,
    [invoiceId]
  );
}

// POST /invoices/bulk/confirm
router.post(
  '/bulk/confirm',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'ids', message: 'ids array is required' },
      ]);
    }

    const succeeded = [];
    const failed = [];

    for (const id of ids) {
      try {
        await confirmSingleInvoice(id);
        succeeded.push(id);
      } catch (err) {
        failed.push({
          id,
          code: err.code || 'INTERNAL',
          message: err.message || 'Failed to confirm invoice',
        });
      }
    }

    return res.status(200).json({
      data: { succeeded, failed },
    });
  })
);

// POST /invoices/bulk/send
router.post(
  '/bulk/send',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'ids', message: 'ids array is required' },
      ]);
    }

    const succeeded = [];
    const failed = [];

    for (const id of ids) {
      try {
        await sendSingleInvoice(id);
        succeeded.push(id);
      } catch (err) {
        failed.push({
          id,
          code: err.code || 'INTERNAL',
          message: err.message || 'Failed to send invoice',
        });
      }
    }

    return res.status(200).json({
      data: { succeeded, failed },
    });
  })
);

// GET /invoices
router.get(
  '/',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit || '20', 10) || 20)
    );
    const offset = (page - 1) * limit;
    const today = getTodayIST();

    const baseConditions = [];
    const baseParams = [];

    if (req.query.customerId) {
      baseParams.push(String(req.query.customerId));
      baseConditions.push(`i.customer_id = $${baseParams.length}`);
    }
    if (req.query.subscriptionId) {
      baseParams.push(String(req.query.subscriptionId));
      baseConditions.push(`i.subscription_id = $${baseParams.length}`);
    }
    if (req.query.search) {
      baseParams.push(`%${String(req.query.search).trim()}%`);
      baseConditions.push(
        `(i.number ILIKE $${baseParams.length} OR c.name ILIKE $${baseParams.length})`
      );
    }
    if (req.query.invoiceFrom) {
      baseParams.push(String(req.query.invoiceFrom));
      baseConditions.push(`i.invoice_date >= $${baseParams.length}`);
    }
    if (req.query.invoiceTo) {
      baseParams.push(String(req.query.invoiceTo));
      baseConditions.push(`i.invoice_date <= $${baseParams.length}`);
    }
    if (req.query.dueFrom) {
      baseParams.push(String(req.query.dueFrom));
      baseConditions.push(`i.due_date >= $${baseParams.length}`);
    }
    if (req.query.dueTo) {
      baseParams.push(String(req.query.dueTo));
      baseConditions.push(`i.due_date <= $${baseParams.length}`);
    }

    const baseWhere =
      baseConditions.length > 0
        ? `WHERE ${baseConditions.join(' AND ')}`
        : '';

    const countsTodayIdx = baseParams.length + 1;
    const countsRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE i.status = 'draft')::int AS draft,
         COUNT(*) FILTER (WHERE i.status = 'confirmed')::int AS confirmed,
         COUNT(*) FILTER (WHERE i.status = 'paid')::int AS paid,
         COUNT(*) FILTER (WHERE i.status = 'cancelled')::int AS cancelled,
         COUNT(*) FILTER (WHERE i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $${countsTodayIdx})::int AS overdue
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       ${baseWhere}`,
      [...baseParams, today]
    );

    const statusCounts = {
      draft: countsRes.rows[0].draft || 0,
      confirmed: countsRes.rows[0].confirmed || 0,
      paid: countsRes.rows[0].paid || 0,
      cancelled: countsRes.rows[0].cancelled || 0,
      overdue: countsRes.rows[0].overdue || 0,
    };

    const listConditions = [...baseConditions];
    const listParams = [...baseParams];

    if (req.query.status) {
      listParams.push(String(req.query.status));
      listConditions.push(`i.status = $${listParams.length}`);
    }
    if (req.query.overdue === 'true' || req.query.overdue === true) {
      listParams.push(today);
      listConditions.push(
        `(i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $${listParams.length})`
      );
    }

    const listWhere =
      listConditions.length > 0
        ? `WHERE ${listConditions.join(' AND ')}`
        : '';

    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       ${listWhere}`,
      listParams
    );
    const total = totalRes.rows[0].total;

    const sortParam = String(req.query.sort || '-invoiceDate');
    const desc = sortParam.startsWith('-');
    const rawField = desc ? sortParam.slice(1) : sortParam;
    const sortMap = {
      invoiceDate: 'i.invoice_date',
      dueDate: 'i.due_date',
      total: 'i.total',
      balance: 'i.balance',
      createdAt: 'i.created_at',
      number: 'i.number',
    };
    const sortCol = sortMap[rawField] || 'i.invoice_date';
    const sortDir = desc ? 'DESC' : 'ASC';

    const listRes = await db.query(
      `SELECT i.*,
              c.name AS customer_name,
              s.number AS subscription_number
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN subscriptions s ON s.id = i.subscription_id
       ${listWhere}
       ORDER BY ${sortCol} ${sortDir}, i.created_at DESC
       LIMIT $${listParams.length + 1} OFFSET $${listParams.length + 2}`,
      [...listParams, limit, offset]
    );

    return res.status(200).json({
      data: listRes.rows.map((r) => formatInvoiceListItem(r, today)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        statusCounts,
      },
    });
  })
);

// GET /invoices/:id
router.get(
  '/:id',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const detail = await getInvoiceDetail(req.params.id, req.user.role);
    if (!detail) {
      throw Errors.notFound();
    }
    return res.status(200).json({ data: detail });
  })
);

// PATCH /invoices/:id (Draft only: invoiceDate, dueDate, notes)
router.patch(
  '/:id',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    if (body.status !== undefined) {
      throw Errors.validation('Some fields are invalid', [
        {
          field: 'status',
          message: 'Status changes are only allowed through action endpoints',
        },
      ]);
    }

    const invRes = await db.query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    if (invRes.rowCount === 0) {
      throw Errors.notFound();
    }
    const inv = invRes.rows[0];

    if (inv.status !== 'draft') {
      throw Errors.notEditable('Only draft invoices can be edited');
    }

    if (
      body.lines !== undefined ||
      body.total !== undefined ||
      body.customerId !== undefined ||
      body.subscriptionId !== undefined
    ) {
      throw Errors.notEditable(
        'Only invoiceDate, dueDate and notes can be edited on a draft invoice'
      );
    }

    const newInvoiceDate =
      body.invoiceDate !== undefined ? body.invoiceDate : inv.invoice_date;
    const newDueDate =
      body.dueDate !== undefined ? body.dueDate : inv.due_date;

    const details = [];
    if (!isValidDateStr(newInvoiceDate)) {
      details.push({
        field: 'invoiceDate',
        message: 'invoiceDate must be YYYY-MM-DD',
      });
    }
    if (!isValidDateStr(newDueDate)) {
      details.push({ field: 'dueDate', message: 'dueDate must be YYYY-MM-DD' });
    }
    if (
      isValidDateStr(newInvoiceDate) &&
      isValidDateStr(newDueDate) &&
      newDueDate < newInvoiceDate
    ) {
      details.push({
        field: 'dueDate',
        message: 'dueDate must be on or after invoiceDate',
      });
    }
    if (details.length > 0) {
      throw Errors.validation('Some fields are invalid', details);
    }

    await db.query(
      `UPDATE invoices
       SET invoice_date = $1,
           due_date = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [newInvoiceDate, newDueDate, id]
    );

    const detail = await getInvoiceDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /invoices/:id/confirm
router.post(
  '/:id/confirm',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await confirmSingleInvoice(id);
    const detail = await getInvoiceDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /invoices/:id/cancel
router.post(
  '/:id/cancel',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const rebill = req.body?.rebill !== false; // default true

    await db.withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT * FROM invoices WHERE id = $1`,
        [id]
      );
      if (invRes.rowCount === 0) {
        throw Errors.notFound();
      }
      const inv = invRes.rows[0];

      if (!['draft', 'confirmed'].includes(inv.status)) {
        throw Errors.invalidTransition(
          `Invoice is ${inv.status}; only draft or confirmed invoices can be cancelled`
        );
      }
      if (Number(inv.amount_paid || 0) > 0) {
        throw Errors.hasPayments();
      }

      // Release reserved discount uses
      const appliedDiscountIds = Array.isArray(inv.applied_discount_ids)
        ? inv.applied_discount_ids
        : [];
      for (const discId of appliedDiscountIds) {
        await client.query(
          `UPDATE discounts
           SET used_count = GREATEST(0, used_count - 1), updated_at = NOW()
           WHERE id = $1`,
          [discId]
        );
      }

      await client.query(
        `UPDATE invoices
         SET status = 'cancelled',
             is_void = TRUE,
             cancelled_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      // If it was the subscription's latest non-void invoice and rebill is true, move nextInvoiceDate back to periodStart
      if (rebill) {
        const laterInv = await client.query(
          `SELECT id FROM invoices
           WHERE subscription_id = $1 AND is_void = FALSE AND period_start > $2
           LIMIT 1`,
          [inv.subscription_id, inv.period_start]
        );
        if (laterInv.rowCount === 0) {
          await client.query(
            `UPDATE subscriptions
             SET next_invoice_date = $1, updated_at = NOW()
             WHERE id = $2`,
            [inv.period_start, inv.subscription_id]
          );
        }
      }
    });

    const detail = await getInvoiceDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /invoices/:id/send
router.post(
  '/:id/send',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await sendSingleInvoice(id);
    const detail = await getInvoiceDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

module.exports = router;



