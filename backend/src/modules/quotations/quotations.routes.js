const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const { toIsoString } = require('../../utils/dates.js');

const router = express.Router();

router.use(authenticate);

async function expandTemplate(row) {
  const planRes = await db.query(`SELECT * FROM plans WHERE id = $1`, [
    row.plan_id,
  ]);
  const plan = planRes.rows[0];

  const rawLines = Array.isArray(row.lines) ? row.lines : [];
  const prodIds = [...new Set(rawLines.map((l) => l.productId))];
  const prodRes =
    prodIds.length > 0
      ? await db.query(`SELECT * FROM products WHERE id = ANY($1::text[])`, [
          prodIds,
        ])
      : { rows: [] };
  const prodMap = new Map(prodRes.rows.map((p) => [p.id, p]));

  const expandedLines = rawLines.map((l) => {
    const prod = prodMap.get(l.productId);
    let variantLabel = null;
    let extraPrice = 0;
    if (prod && l.variantId) {
      const v = (prod.variants || []).find((x) => x.id === l.variantId);
      if (v) {
        variantLabel = `${v.attribute}: ${v.value}`;
        extraPrice = Number(v.extraPrice || 0);
      }
    }
    const basePrice =
      plan && l.productId === plan.product_id
        ? Number(plan.price)
        : prod
        ? Number(prod.sales_price)
        : 0;
    return {
      productId: l.productId,
      productName: prod ? prod.name : '',
      variantId: l.variantId || null,
      variantLabel,
      quantity: Number(l.quantity),
      unitPrice: basePrice + extraPrice,
    };
  });

  const usedRes = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM subscriptions WHERE template_id = $1`,
    [row.id]
  );

  return {
    id: row.id,
    name: row.name,
    planId: row.plan_id,
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          billingPeriod: plan.billing_period,
        }
      : null,
    validityDays: Number(row.validity_days),
    paymentTermDays: Number(row.payment_term_days),
    lines: expandedLines,
    notes: row.notes || '',
    usedCount: usedRes.rows[0].cnt,
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function validateTemplateAndLines(body, existing = null) {
  const details = [];
  const name = body.name !== undefined ? body.name : existing?.name;
  const planId = body.planId !== undefined ? body.planId : existing?.plan_id;
  const validityDays =
    body.validityDays !== undefined
      ? body.validityDays
      : existing?.validity_days ?? 14;
  const paymentTermDays =
    body.paymentTermDays !== undefined
      ? body.paymentTermDays
      : existing?.payment_term_days ?? 0;
  const lines = body.lines !== undefined ? body.lines : existing?.lines ?? [];

  if (typeof name !== 'string' || !name.trim()) {
    details.push({ field: 'name', message: 'Template name is required' });
  }
  if (typeof planId !== 'string' || !planId.trim()) {
    details.push({ field: 'planId', message: 'planId is required' });
  }
  if (!Number.isInteger(validityDays) || validityDays < 1) {
    details.push({
      field: 'validityDays',
      message: 'validityDays must be an integer >= 1',
    });
  }
  if (![0, 15, 30, 45].includes(paymentTermDays)) {
    details.push({
      field: 'paymentTermDays',
      message: 'paymentTermDays must be 0, 15, 30 or 45',
    });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    details.push({
      field: 'lines',
      message: 'At least one line is required',
    });
  }

  if (details.length > 0) {
    throw Errors.validation('Some fields are invalid', details);
  }

  const planRes = await db.query(`SELECT * FROM plans WHERE id = $1`, [planId]);
  if (planRes.rowCount === 0) {
    throw Errors.validation('Some fields are invalid', [
      { field: 'planId', message: 'Plan not found' },
    ]);
  }
  const plan = planRes.rows[0];

  // Validate lines and check plan product minQuantity
  let planProdQty = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l || typeof l.productId !== 'string' || !Number.isInteger(l.quantity) || l.quantity < 1) {
      throw Errors.validation('Some fields are invalid', [
        {
          field: `lines.${i}`,
          message: 'Each line requires productId and integer quantity >= 1',
        },
      ]);
    }
    if (l.productId === plan.product_id) {
      planProdQty += l.quantity;
    }
  }

  if (planProdQty < Number(plan.min_quantity)) {
    throw Errors.belowMinQuantity();
  }

  return {
    name: name.trim(),
    planId,
    validityDays,
    paymentTermDays,
    lines: lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId || null,
      quantity: Number(l.quantity),
    })),
    notes: body.notes !== undefined ? String(body.notes) : existing?.notes ?? '',
    isActive:
      body.isActive !== undefined
        ? Boolean(body.isActive)
        : existing?.is_active ?? true,
  };
}

// GET /quotation-templates
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
      conditions.push(`name ILIKE $${params.length}`);
    }
    if (req.query.planId) {
      params.push(String(req.query.planId));
      conditions.push(`plan_id = $${params.length}`);
    }
    if (req.query.isActive !== undefined) {
      params.push(req.query.isActive === 'true' || req.query.isActive === true);
      conditions.push(`is_active = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM quotation_templates ${whereClause}`,
      params
    );
    const total = countRes.rows[0].total;

    const listRes = await db.query(
      `SELECT * FROM quotation_templates ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const data = await Promise.all(listRes.rows.map(expandTemplate));

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

// POST /quotation-templates
router.post(
  '/',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const clean = await validateTemplateAndLines(req.body || {}, null);
    const id = generateId();

    const ins = await db.query(
      `INSERT INTO quotation_templates (id, name, plan_id, validity_days, payment_term_days, lines, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING *`,
      [
        id,
        clean.name,
        clean.planId,
        clean.validityDays,
        clean.paymentTermDays,
        JSON.stringify(clean.lines),
        clean.notes,
        clean.isActive,
      ]
    );

    return res.status(201).json({
      data: await expandTemplate(ins.rows[0]),
    });
  })
);

// GET /quotation-templates/:id
router.get(
  '/:id',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tplRes = await db.query(
      `SELECT * FROM quotation_templates WHERE id = $1`,
      [id]
    );
    if (tplRes.rowCount === 0) {
      throw Errors.notFound();
    }
    return res.status(200).json({
      data: await expandTemplate(tplRes.rows[0]),
    });
  })
);

// PATCH /quotation-templates/:id
router.patch(
  '/:id',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tplRes = await db.query(
      `SELECT * FROM quotation_templates WHERE id = $1`,
      [id]
    );
    if (tplRes.rowCount === 0) {
      throw Errors.notFound();
    }

    const clean = await validateTemplateAndLines(
      req.body || {},
      tplRes.rows[0]
    );

    const upd = await db.query(
      `UPDATE quotation_templates
       SET name = $1,
           plan_id = $2,
           validity_days = $3,
           payment_term_days = $4,
           lines = $5::jsonb,
           notes = $6,
           is_active = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        clean.name,
        clean.planId,
        clean.validityDays,
        clean.paymentTermDays,
        JSON.stringify(clean.lines),
        clean.notes,
        clean.isActive,
        id,
      ]
    );

    return res.status(200).json({
      data: await expandTemplate(upd.rows[0]),
    });
  })
);

// DELETE /quotation-templates/:id
router.delete(
  '/:id',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const upd = await db.query(
      `UPDATE quotation_templates SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (upd.rowCount === 0) {
      throw Errors.notFound();
    }
    return res.status(204).send();
  })
);

module.exports = router;



