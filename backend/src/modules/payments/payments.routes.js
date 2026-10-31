const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const {
  getTodayIST,
  isValidDateStr,
  toIsoString,
} = require('../../utils/dates.js');

const router = express.Router();

router.use(authenticate);

function formatPayment(row) {
  return {
    id: row.id,
    invoice: {
      id: row.invoice_id,
      number: row.invoice_number || '',
    },
    customer: {
      id: row.customer_id,
      name: row.customer_name || '',
    },
    subscriptionId: row.subscription_id,
    method: row.method,
    amount: Number(row.amount),
    paymentDate: row.payment_date,
    note: row.note || '',
    recordedBy: {
      id: row.recorded_by,
      name: row.recorded_by_name || '',
    },
    createdAt: toIsoString(row.created_at),
  };
}

// GET /payments
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

    const conditions = [];
    const params = [];

    if (req.query.invoiceId) {
      params.push(String(req.query.invoiceId));
      conditions.push(`p.invoice_id = $${params.length}`);
    }
    if (req.query.customerId) {
      params.push(String(req.query.customerId));
      conditions.push(`p.customer_id = $${params.length}`);
    }
    if (req.query.method) {
      params.push(String(req.query.method));
      conditions.push(`p.method = $${params.length}`);
    }
    if (req.query.dateFrom) {
      params.push(String(req.query.dateFrom));
      conditions.push(`p.payment_date >= $${params.length}`);
    }
    if (req.query.dateTo) {
      params.push(String(req.query.dateTo));
      conditions.push(`p.payment_date <= $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      conditions.push(
        `(i.number ILIKE $${params.length} OR c.name ILIKE $${params.length})`
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const aggRes = await db.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(p.amount), 0) AS total_amount
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN customers c ON c.id = p.customer_id
       ${whereClause}`,
      params
    );
    const total = aggRes.rows[0].total;
    const totalAmount = Number(aggRes.rows[0].total_amount || 0);

    const sortParam = String(req.query.sort || '-paymentDate');
    const desc = sortParam.startsWith('-');
    const rawField = desc ? sortParam.slice(1) : sortParam;
    const sortMap = {
      paymentDate: 'p.payment_date',
      amount: 'p.amount',
      createdAt: 'p.created_at',
    };
    const sortCol = sortMap[rawField] || 'p.payment_date';
    const sortDir = desc ? 'DESC' : 'ASC';

    const listRes = await db.query(
      `SELECT p.*,
              i.number AS invoice_number,
              c.name AS customer_name,
              u.name AS recorded_by_name
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = p.recorded_by
       ${whereClause}
       ORDER BY ${sortCol} ${sortDir}, p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      data: listRes.rows.map(formatPayment),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        totalAmount,
      },
    });
  })
);

// POST /payments
router.post(
  '/',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const details = [];

    const invoiceId = body.invoiceId;
    const method = body.method;
    const amount = body.amount;
    const paymentDate = body.paymentDate || getTodayIST();
    const note = typeof body.note === 'string' ? body.note : '';

    if (!invoiceId || typeof invoiceId !== 'string') {
      details.push({ field: 'invoiceId', message: 'invoiceId is required' });
    }
    if (
      ![
        'bank_transfer',
        'card',
        'cash',
        'cheque',
        'upi',
        'other',
      ].includes(method)
    ) {
      details.push({
        field: 'method',
        message:
          'method must be bank_transfer, card, cash, cheque, upi or other',
      });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      details.push({
        field: 'amount',
        message: 'amount must be an integer > 0 (in paise)',
      });
    }
    const today = getTodayIST();
    if (!isValidDateStr(paymentDate)) {
      details.push({
        field: 'paymentDate',
        message: 'paymentDate must be YYYY-MM-DD',
      });
    } else if (paymentDate > today) {
      details.push({
        field: 'paymentDate',
        message: 'paymentDate cannot be in the future',
      });
    }

    if (details.length > 0) {
      throw Errors.validation('Some fields are invalid', details);
    }

    const result = await db.withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT * FROM invoices WHERE id = $1`,
        [invoiceId]
      );
      if (invRes.rowCount === 0) {
        throw Errors.notFound('Invoice not found');
      }
      const inv = invRes.rows[0];

      if (inv.status !== 'confirmed') {
        throw Errors.invalidTransition(
          `Cannot record payment on a ${inv.status} invoice`
        );
      }

      if (amount > Number(inv.balance)) {
        throw Errors.overpayment();
      }

      // Atomic conditional update to prevent concurrent overpayments
      const updInvRes = await client.query(
        `UPDATE invoices
         SET amount_paid = amount_paid + $1,
             balance = balance - $1,
             status = CASE WHEN balance - $1 = 0 THEN 'paid' ELSE 'confirmed' END,
             paid_at = CASE WHEN balance - $1 = 0 THEN NOW() ELSE paid_at END,
             updated_at = NOW()
         WHERE id = $2 AND status = 'confirmed' AND balance >= $1
         RETURNING *`,
        [amount, invoiceId]
      );

      if (updInvRes.rowCount === 0) {
        throw Errors.overpayment();
      }

      const updatedInv = updInvRes.rows[0];
      const payId = generateId();

      const payIns = await client.query(
        `INSERT INTO payments (id, invoice_id, customer_id, subscription_id, method, amount, payment_date, note, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          payId,
          updatedInv.id,
          updatedInv.customer_id,
          updatedInv.subscription_id,
          method,
          amount,
          paymentDate,
          note,
          req.user.id,
        ]
      );

      const custRes = await client.query(
        `SELECT name FROM customers WHERE id = $1`,
        [updatedInv.customer_id]
      );

      return {
        payment: formatPayment({
          ...payIns.rows[0],
          invoice_number: updatedInv.number,
          customer_name: custRes.rows[0]?.name || '',
          recorded_by_name: req.user.name,
        }),
        invoice: {
          id: updatedInv.id,
          number: updatedInv.number,
          status: updatedInv.status,
          amountPaid: Number(updatedInv.amount_paid),
          balance: Number(updatedInv.balance),
        },
      };
    });

    return res.status(201).json({ data: result });
  })
);

// GET /payments/:id
router.get(
  '/:id',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payRes = await db.query(
      `SELECT p.*,
              i.number AS invoice_number,
              c.name AS customer_name,
              u.name AS recorded_by_name
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.id = $1`,
      [id]
    );
    if (payRes.rowCount === 0) {
      throw Errors.notFound();
    }
    return res.status(200).json({
      data: formatPayment(payRes.rows[0]),
    });
  })
);

// DELETE /payments/:id (Admin only, reverses payment in one transaction)
router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await db.withTransaction(async (client) => {
      const payRes = await client.query(
        `SELECT * FROM payments WHERE id = $1`,
        [id]
      );
      if (payRes.rowCount === 0) {
        throw Errors.notFound();
      }
      const pay = payRes.rows[0];
      const amount = Number(pay.amount);

      await client.query(`DELETE FROM payments WHERE id = $1`, [id]);

      await client.query(
        `UPDATE invoices
         SET amount_paid = GREATEST(0, amount_paid - $1),
             balance = balance + $1,
             status = 'confirmed',
             paid_at = NULL,
             updated_at = NOW()
         WHERE id = $2`,
        [amount, pay.invoice_id]
      );
    });

    return res.status(204).send();
  })
);

module.exports = router;



