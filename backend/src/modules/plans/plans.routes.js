const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const { isValidDateStr, toIsoString } = require('../../utils/dates.js');

const router = express.Router();

router.use(authenticate);

function formatPlan(row, productRow = null, activeSubsCount = 0) {
  const out = {
    id: row.id,
    name: row.name,
    productId: row.product_id,
    price: Number(row.price),
    billingPeriod: row.billing_period,
    minQuantity: Number(row.min_quantity),
    availableFrom: row.available_from,
    availableUntil: row.available_until || null,
    rules: row.rules || {
      autoClose: false,
      closable: true,
      pausable: false,
      renewable: true,
    },
    description: row.description || '',
    activeSubscriptions: Number(activeSubsCount),
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };

  if (productRow) {
    out.product = {
      id: productRow.id,
      name: productRow.name,
      type: productRow.type,
      salesPrice: Number(productRow.sales_price),
      variants: productRow.variants || [],
    };
  }

  return out;
}

function validatePlanInput(body, isPatch = false) {
  const details = [];

  if (!isPatch || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      details.push({ field: 'name', message: 'Plan name is required' });
    }
  }
  if (!isPatch || body.productId !== undefined) {
    if (typeof body.productId !== 'string' || !body.productId.trim()) {
      details.push({ field: 'productId', message: 'productId is required' });
    }
  }
  if (!isPatch || body.price !== undefined) {
    if (!Number.isInteger(body.price) || body.price < 0) {
      details.push({
        field: 'price',
        message: 'price must be an integer >= 0 (in paise)',
      });
    }
  }
  if (!isPatch || body.billingPeriod !== undefined) {
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(body.billingPeriod)) {
      details.push({
        field: 'billingPeriod',
        message: 'billingPeriod must be daily, weekly, monthly or yearly',
      });
    }
  }
  if (!isPatch || body.minQuantity !== undefined) {
    if (!Number.isInteger(body.minQuantity) || body.minQuantity < 1) {
      details.push({
        field: 'minQuantity',
        message: 'minQuantity must be an integer >= 1',
      });
    }
  }
  if (!isPatch || body.availableFrom !== undefined) {
    if (!isValidDateStr(body.availableFrom)) {
      details.push({
        field: 'availableFrom',
        message: 'availableFrom must be YYYY-MM-DD',
      });
    }
  }
  if (body.availableUntil !== undefined && body.availableUntil !== null) {
    if (!isValidDateStr(body.availableUntil)) {
      details.push({
        field: 'availableUntil',
        message: 'availableUntil must be YYYY-MM-DD or null',
      });
    }
  }

  if (details.length > 0) {
    throw Errors.validation('Some fields are invalid', details);
  }
}

// GET /plans
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

    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      conditions.push(`pl.name ILIKE $${params.length}`);
    }
    if (req.query.billingPeriod) {
      params.push(String(req.query.billingPeriod));
      conditions.push(`pl.billing_period = $${params.length}`);
    }
    if (req.query.isActive !== undefined) {
      params.push(req.query.isActive === 'true' || req.query.isActive === true);
      conditions.push(`pl.is_active = $${params.length}`);
    }
    if (req.query.availableOn) {
      params.push(String(req.query.availableOn));
      conditions.push(
        `(pl.available_from <= $${params.length} AND (pl.available_until IS NULL OR pl.available_until >= $${params.length}))`
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM plans pl ${whereClause}`,
      params
    );
    const total = countRes.rows[0].total;

    const listRes = await db.query(
      `SELECT pl.*,
              p.name AS prod_name, p.type AS prod_type, p.sales_price AS prod_sales_price, p.variants AS prod_variants,
              (SELECT COUNT(*)::int FROM subscriptions s WHERE s.plan_id = pl.id AND s.status = 'active') AS active_subs
       FROM plans pl
       LEFT JOIN products p ON p.id = pl.product_id
       ${whereClause}
       ORDER BY pl.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const data = listRes.rows.map((r) =>
      formatPlan(
        r,
        r.prod_name
          ? {
              id: r.product_id,
              name: r.prod_name,
              type: r.prod_type,
              sales_price: r.prod_sales_price,
              variants: r.prod_variants,
            }
          : null,
        r.active_subs
      )
    );

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

// POST /plans
router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    validatePlanInput(body, false);

    if (
      body.availableUntil &&
      body.availableUntil < body.availableFrom
    ) {
      throw Errors.validation('Some fields are invalid', [
        {
          field: 'availableUntil',
          message: 'availableUntil must be on or after availableFrom',
        },
      ]);
    }

    const prodRes = await db.query(`SELECT * FROM products WHERE id = $1`, [
      body.productId,
    ]);
    if (prodRes.rowCount === 0) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'productId', message: 'Product not found' },
      ]);
    }

    const rules = {
      autoClose: Boolean(body.rules?.autoClose),
      closable: Boolean(body.rules?.closable),
      pausable: Boolean(body.rules?.pausable),
      renewable: Boolean(body.rules?.renewable ?? true),
    };

    const id = generateId();
    const ins = await db.query(
      `INSERT INTO plans (id, name, product_id, price, billing_period, min_quantity, available_from, available_until, rules, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
       RETURNING *`,
      [
        id,
        body.name.trim(),
        body.productId,
        body.price,
        body.billingPeriod,
        body.minQuantity,
        body.availableFrom,
        body.availableUntil || null,
        JSON.stringify(rules),
        body.description || '',
        body.isActive !== undefined ? Boolean(body.isActive) : true,
      ]
    );

    return res.status(201).json({
      data: formatPlan(ins.rows[0], prodRes.rows[0], 0),
    });
  })
);

// GET /plans/:id
router.get(
  '/:id',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const planRes = await db.query(`SELECT * FROM plans WHERE id = $1`, [id]);
    if (planRes.rowCount === 0) {
      throw Errors.notFound();
    }
    const plan = planRes.rows[0];
    const prodRes = await db.query(`SELECT * FROM products WHERE id = $1`, [
      plan.product_id,
    ]);
    const activeSubsRes = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM subscriptions WHERE plan_id = $1 AND status = 'active'`,
      [id]
    );

    return res.status(200).json({
      data: formatPlan(plan, prodRes.rows[0], activeSubsRes.rows[0].cnt),
    });
  })
);

// PATCH /plans/:id
router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    validatePlanInput(body, true);

    const planRes = await db.query(`SELECT * FROM plans WHERE id = $1`, [id]);
    if (planRes.rowCount === 0) {
      throw Errors.notFound();
    }
    const existing = planRes.rows[0];

    const newFrom =
      body.availableFrom !== undefined
        ? body.availableFrom
        : existing.available_from;
    const newUntil =
      body.availableUntil !== undefined
        ? body.availableUntil
        : existing.available_until;

    if (newUntil && newUntil < newFrom) {
      throw Errors.validation('Some fields are invalid', [
        {
          field: 'availableUntil',
          message: 'availableUntil must be on or after availableFrom',
        },
      ]);
    }

    const newRules =
      body.rules && typeof body.rules === 'object'
        ? { ...(existing.rules || {}), ...body.rules }
        : existing.rules;

    const upd = await db.query(
      `UPDATE plans
       SET name = $1,
           product_id = $2,
           price = $3,
           billing_period = $4,
           min_quantity = $5,
           available_from = $6,
           available_until = $7,
           rules = $8::jsonb,
           description = $9,
           is_active = $10,
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        body.name !== undefined ? body.name.trim() : existing.name,
        body.productId !== undefined ? body.productId : existing.product_id,
        body.price !== undefined ? body.price : existing.price,
        body.billingPeriod !== undefined
          ? body.billingPeriod
          : existing.billing_period,
        body.minQuantity !== undefined
          ? body.minQuantity
          : existing.min_quantity,
        newFrom,
        newUntil,
        JSON.stringify(newRules),
        body.description !== undefined
          ? body.description
          : existing.description,
        body.isActive !== undefined
          ? Boolean(body.isActive)
          : existing.is_active,
        id,
      ]
    );

    const prodRes = await db.query(`SELECT * FROM products WHERE id = $1`, [
      upd.rows[0].product_id,
    ]);
    const activeSubsRes = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM subscriptions WHERE plan_id = $1 AND status = 'active'`,
      [id]
    );

    return res.status(200).json({
      data: formatPlan(upd.rows[0], prodRes.rows[0], activeSubsRes.rows[0].cnt),
    });
  })
);

// DELETE /plans/:id
router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const upd = await db.query(
      `UPDATE plans SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (upd.rowCount === 0) {
      throw Errors.notFound();
    }
    return res.status(204).send();
  })
);

module.exports = router;



