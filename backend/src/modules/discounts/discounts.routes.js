const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const {
  isValidDateStr,
  getTodayIST,
  toIsoString,
} = require('../../utils/dates.js');
const { computeDiscountState } = require('../../utils/pricing.js');

const router = express.Router();

router.use(authenticate);

function formatDiscount(row, onDate = getTodayIST()) {
  const usageLimit =
    row.usage_limit !== null && row.usage_limit !== undefined
      ? Number(row.usage_limit)
      : null;
  const usedCount = Number(row.used_count || 0);
  const remainingUses =
    usageLimit === null ? null : Math.max(0, usageLimit - usedCount);

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    value: Number(row.value),
    minPurchaseAmount:
      row.min_purchase_amount !== null && row.min_purchase_amount !== undefined
        ? Number(row.min_purchase_amount)
        : null,
    minQuantity:
      row.min_quantity !== null && row.min_quantity !== undefined
        ? Number(row.min_quantity)
        : null,
    startDate: row.start_date,
    endDate: row.end_date,
    usageLimit,
    usedCount,
    remainingUses,
    state: computeDiscountState(row, onDate),
    appliesTo: row.applies_to || { kind: 'subscription', productIds: [] },
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function validateDiscountInput(body, existing = null) {
  const details = [];
  const isPatch = Boolean(existing);

  const name = body.name !== undefined ? body.name : existing?.name;
  const type = body.type !== undefined ? body.type : existing?.type;
  const value =
    body.value !== undefined ? body.value : Number(existing?.value);
  const startDate =
    body.startDate !== undefined ? body.startDate : existing?.start_date;
  const endDate =
    body.endDate !== undefined ? body.endDate : existing?.end_date;
  const minPurchaseAmount =
    body.minPurchaseAmount !== undefined
      ? body.minPurchaseAmount
      : existing?.min_purchase_amount ?? null;
  const minQuantity =
    body.minQuantity !== undefined
      ? body.minQuantity
      : existing?.min_quantity ?? null;
  const usageLimit =
    body.usageLimit !== undefined
      ? body.usageLimit
      : existing?.usage_limit ?? null;
  const appliesTo =
    body.appliesTo !== undefined ? body.appliesTo : existing?.applies_to;

  if (typeof name !== 'string' || !name.trim()) {
    details.push({ field: 'name', message: 'Discount name is required' });
  }
  if (!['percentage', 'fixed'].includes(type)) {
    details.push({
      field: 'type',
      message: 'type must be percentage or fixed',
    });
  }
  if (typeof value !== 'number' || value <= 0) {
    details.push({ field: 'value', message: 'value must be > 0' });
  } else if (type === 'percentage' && (value < 0 || value > 100)) {
    details.push({
      field: 'value',
      message: 'Percentage value must be between 0 and 100',
    });
  } else if (type === 'fixed' && !Number.isInteger(value)) {
    details.push({
      field: 'value',
      message: 'Fixed discount value must be an integer in paise',
    });
  }

  if (
    minPurchaseAmount !== null &&
    (!Number.isInteger(minPurchaseAmount) || minPurchaseAmount < 0)
  ) {
    details.push({
      field: 'minPurchaseAmount',
      message: 'minPurchaseAmount must be null or an integer >= 0 (in paise)',
    });
  }

  if (
    minQuantity !== null &&
    (!Number.isInteger(minQuantity) || minQuantity < 1)
  ) {
    details.push({
      field: 'minQuantity',
      message: 'minQuantity must be null or an integer >= 1',
    });
  }

  if (!isValidDateStr(startDate)) {
    details.push({
      field: 'startDate',
      message: 'startDate must be YYYY-MM-DD',
    });
  }
  if (!isValidDateStr(endDate)) {
    details.push({ field: 'endDate', message: 'endDate must be YYYY-MM-DD' });
  }
  if (
    isValidDateStr(startDate) &&
    isValidDateStr(endDate) &&
    endDate < startDate
  ) {
    details.push({
      field: 'endDate',
      message: 'endDate must be on or after startDate',
    });
  }

  const usedCount = Number(existing?.used_count || 0);
  if (usageLimit !== null) {
    if (!Number.isInteger(usageLimit) || usageLimit < 1) {
      details.push({
        field: 'usageLimit',
        message: 'usageLimit must be null or an integer >= 1',
      });
    } else if (isPatch && usageLimit < usedCount) {
      details.push({
        field: 'usageLimit',
        message: 'usageLimit cannot be set below usedCount',
      });
    }
  }

  if (
    !appliesTo ||
    typeof appliesTo !== 'object' ||
    !['products', 'subscription'].includes(appliesTo.kind)
  ) {
    details.push({
      field: 'appliesTo.kind',
      message: 'appliesTo.kind must be products or subscription',
    });
  }

  if (details.length > 0) {
    throw Errors.validation('Some fields are invalid', details);
  }

  return {
    name: name.trim(),
    type,
    value,
    minPurchaseAmount,
    minQuantity,
    startDate,
    endDate,
    usageLimit,
    appliesTo: {
      kind: appliesTo.kind,
      productIds: Array.isArray(appliesTo.productIds)
        ? appliesTo.productIds
        : [],
    },
    isActive:
      body.isActive !== undefined
        ? Boolean(body.isActive)
        : existing?.is_active ?? true,
  };
}

// GET /discounts
router.get(
  '/',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit || '20', 10) || 20)
    );

    const conditions = [];
    const params = [];

    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allRes = await db.query(
      `SELECT * FROM discounts ${whereClause} ORDER BY created_at DESC`,
      params
    );

    const today = getTodayIST();
    let formatted = allRes.rows.map((r) => formatDiscount(r, today));

    if (req.query.state) {
      const targetState = String(req.query.state);
      formatted = formatted.filter((d) => d.state === targetState);
    }

    const total = formatted.length;
    const paged = formatted.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      data: paged,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  })
);

// POST /discounts
router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const clean = validateDiscountInput(req.body || {}, null);
    const id = generateId();

    const ins = await db.query(
      `INSERT INTO discounts (id, name, type, value, min_purchase_amount, min_quantity, start_date, end_date, usage_limit, used_count, applies_to, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10::jsonb, $11)
       RETURNING *`,
      [
        id,
        clean.name,
        clean.type,
        clean.value,
        clean.minPurchaseAmount,
        clean.minQuantity,
        clean.startDate,
        clean.endDate,
        clean.usageLimit,
        JSON.stringify(clean.appliesTo),
        clean.isActive,
      ]
    );

    return res.status(201).json({
      data: formatDiscount(ins.rows[0]),
    });
  })
);

// GET /discounts/:id
router.get(
  '/:id',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const discRes = await db.query(`SELECT * FROM discounts WHERE id = $1`, [
      id,
    ]);
    if (discRes.rowCount === 0) {
      throw Errors.notFound();
    }
    return res.status(200).json({
      data: formatDiscount(discRes.rows[0]),
    });
  })
);

// PATCH /discounts/:id
router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const discRes = await db.query(`SELECT * FROM discounts WHERE id = $1`, [
      id,
    ]);
    if (discRes.rowCount === 0) {
      throw Errors.notFound();
    }

    const clean = validateDiscountInput(req.body || {}, discRes.rows[0]);

    const upd = await db.query(
      `UPDATE discounts
       SET name = $1,
           type = $2,
           value = $3,
           min_purchase_amount = $4,
           min_quantity = $5,
           start_date = $6,
           end_date = $7,
           usage_limit = $8,
           applies_to = $9::jsonb,
           is_active = $10,
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        clean.name,
        clean.type,
        clean.value,
        clean.minPurchaseAmount,
        clean.minQuantity,
        clean.startDate,
        clean.endDate,
        clean.usageLimit,
        JSON.stringify(clean.appliesTo),
        clean.isActive,
        id,
      ]
    );

    return res.status(200).json({
      data: formatDiscount(upd.rows[0]),
    });
  })
);

// POST /discounts/:id/stop
router.post(
  '/:id/stop',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const upd = await db.query(
      `UPDATE discounts SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (upd.rowCount === 0) {
      throw Errors.notFound();
    }
    return res.status(200).json({
      data: formatDiscount(upd.rows[0]),
    });
  })
);

module.exports = router;



