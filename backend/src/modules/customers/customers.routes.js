const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const { getTodayIST, toIsoString } = require('../../utils/dates.js');

const router = express.Router();

router.use(authenticate);

function formatCustomer(row) {
  let portalStatus = 'none';
  if (row.user_id && row.user_status) {
    portalStatus = row.user_status === 'disabled' ? 'disabled' : 'active';
  }

  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name || '',
    email: row.email,
    phone: row.phone || '',
    billingAddress: row.billing_address || {},
    taxId: row.tax_id || '',
    notes: row.notes || '',
    portalStatus,
    stats: {
      activeSubscriptions: Number(row.active_subscriptions || 0),
      outstandingAmount: Number(row.outstanding_amount || 0),
      overdueAmount: Number(row.overdue_amount || 0),
      paidToDate: Number(row.paid_to_date || 0),
    },
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

// GET /customers
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

    const conditions = [];
    const params = [];

    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      conditions.push(
        `(c.name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.contact_name ILIKE $${params.length})`
      );
    }
    if (req.query.isActive !== undefined) {
      params.push(req.query.isActive === 'true' || req.query.isActive === true);
      conditions.push(`c.is_active = $${params.length}`);
    }
    if (req.query.hasOverdue === 'true' || req.query.hasOverdue === true) {
      params.push(today);
      conditions.push(
        `EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id AND i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $${params.length})`
      );
    }
    if (req.query.hasActiveSubscription !== undefined) {
      const wantActive =
        req.query.hasActiveSubscription === 'true' ||
        req.query.hasActiveSubscription === true;
      if (wantActive) {
        conditions.push(
          `EXISTS (SELECT 1 FROM subscriptions s WHERE s.customer_id = c.id AND s.status = 'active')`
        );
      } else {
        conditions.push(
          `NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.customer_id = c.id AND s.status = 'active')`
        );
      }
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM customers c ${whereClause}`,
      params
    );
    const total = countRes.rows[0].total;

    const todayIdx = params.length + 1;
    // One query with aggregated stats per page of results (no N+1 queries)
    const listRes = await db.query(
      `SELECT c.*,
              u.status AS user_status,
              COALESCE(sub_stats.active_subscriptions, 0) AS active_subscriptions,
              COALESCE(inv_stats.outstanding_amount, 0) AS outstanding_amount,
              COALESCE(inv_stats.overdue_amount, 0) AS overdue_amount,
              COALESCE(pay_stats.paid_to_date, 0) AS paid_to_date
       FROM customers c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS active_subscriptions
         FROM subscriptions s
         WHERE s.customer_id = c.id AND s.status = 'active'
       ) sub_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(CASE WHEN i.status = 'confirmed' THEN i.balance ELSE 0 END), 0) AS outstanding_amount,
                COALESCE(SUM(CASE WHEN i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $${todayIdx} THEN i.balance ELSE 0 END), 0) AS overdue_amount
         FROM invoices i
         WHERE i.customer_id = c.id
       ) inv_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(p.amount), 0) AS paid_to_date
         FROM payments p
         WHERE p.customer_id = c.id
       ) pay_stats ON TRUE
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${params.length + 2} OFFSET $${params.length + 3}`,
      [...params, today, limit, offset]
    );

    return res.status(200).json({
      data: listRes.rows.map(formatCustomer),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  })
);

// POST /customers
router.post(
  '/',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const details = [];

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!name) {
      details.push({ field: 'name', message: 'Customer name is required' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      details.push({ field: 'email', message: 'Valid email is required' });
    }

    if (details.length > 0) {
      throw Errors.validation('Some fields are invalid', details);
    }

    const id = generateId();
    const ins = await db.query(
      `INSERT INTO customers (id, name, contact_name, email, phone, billing_address, tax_id, notes, user_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NULL, TRUE)
       RETURNING *`,
      [
        id,
        name,
        typeof body.contactName === 'string' ? body.contactName.trim() : '',
        email,
        typeof body.phone === 'string' ? body.phone.trim() : '',
        JSON.stringify(body.billingAddress || {}),
        typeof body.taxId === 'string' ? body.taxId.trim() : '',
        typeof body.notes === 'string' ? body.notes : '',
      ]
    );

    return res.status(201).json({
      data: formatCustomer(ins.rows[0]),
    });
  })
);

// GET /customers/:id
router.get(
  '/:id',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const today = getTodayIST();

    const custRes = await db.query(
      `SELECT c.*,
              u.status AS user_status,
              (SELECT COUNT(*)::int FROM subscriptions s WHERE s.customer_id = c.id AND s.status = 'active') AS active_subscriptions,
              (SELECT COALESCE(SUM(balance), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'confirmed') AS outstanding_amount,
              (SELECT COALESCE(SUM(balance), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $2) AS overdue_amount,
              (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.customer_id = c.id) AS paid_to_date
       FROM customers c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
      [id, today]
    );

    if (custRes.rowCount === 0) {
      throw Errors.notFound();
    }

    return res.status(200).json({
      data: formatCustomer(custRes.rows[0]),
    });
  })
);

// PATCH /customers/:id
router.patch(
  '/:id',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    const existingRes = await db.query(
      `SELECT * FROM customers WHERE id = $1`,
      [id]
    );
    if (existingRes.rowCount === 0) {
      throw Errors.notFound();
    }
    const existing = existingRes.rows[0];

    const newName =
      body.name !== undefined ? String(body.name).trim() : existing.name;
    const newEmail =
      body.email !== undefined
        ? String(body.email).trim().toLowerCase()
        : existing.email;

    if (!newName) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'name', message: 'Customer name is required' },
      ]);
    }
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'email', message: 'Valid email is required' },
      ]);
    }

    await db.query(
      `UPDATE customers
       SET name = $1,
           contact_name = $2,
           email = $3,
           phone = $4,
           billing_address = $5::jsonb,
           tax_id = $6,
           notes = $7,
           is_active = $8,
           updated_at = NOW()
       WHERE id = $9`,
      [
        newName,
        body.contactName !== undefined
          ? String(body.contactName).trim()
          : existing.contact_name,
        newEmail,
        body.phone !== undefined ? String(body.phone).trim() : existing.phone,
        JSON.stringify(
          body.billingAddress !== undefined
            ? body.billingAddress
            : existing.billing_address
        ),
        body.taxId !== undefined ? String(body.taxId).trim() : existing.tax_id,
        body.notes !== undefined ? String(body.notes) : existing.notes,
        body.isActive !== undefined
          ? Boolean(body.isActive)
          : existing.is_active,
        id,
      ]
    );

    const today = getTodayIST();
    const custRes = await db.query(
      `SELECT c.*,
              u.status AS user_status,
              (SELECT COUNT(*)::int FROM subscriptions s WHERE s.customer_id = c.id AND s.status = 'active') AS active_subscriptions,
              (SELECT COALESCE(SUM(balance), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'confirmed') AS outstanding_amount,
              (SELECT COALESCE(SUM(balance), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'confirmed' AND i.balance > 0 AND i.due_date < $2) AS overdue_amount,
              (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.customer_id = c.id) AS paid_to_date
       FROM customers c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
      [id, today]
    );

    return res.status(200).json({
      data: formatCustomer(custRes.rows[0]),
    });
  })
);

// DELETE /customers/:id
router.delete(
  '/:id',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const custRes = await db.query(`SELECT id FROM customers WHERE id = $1`, [
      id,
    ]);
    if (custRes.rowCount === 0) {
      throw Errors.notFound();
    }

    const activeSubsRes = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM subscriptions WHERE customer_id = $1 AND status = 'active'`,
      [id]
    );
    if (activeSubsRes.rows[0].cnt > 0) {
      throw Errors.notEditable(
        'Cannot archive a customer with active subscriptions'
      );
    }

    await db.query(
      `UPDATE customers SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return res.status(204).send();
  })
);

module.exports = router;



