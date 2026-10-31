const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const { toIsoString } = require('../../utils/dates.js');

const router = express.Router();

router.use(authenticate);

function formatTax(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    rate: Number(row.rate),
    appliesTo: row.applies_to || {
      kind: 'all',
      productTypes: [],
      productIds: [],
    },
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function validateTaxInput(body, isPatch = false) {
  const details = [];

  if (!isPatch || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      details.push({ field: 'name', message: 'Tax name is required' });
    }
  }
  if (!isPatch || body.type !== undefined) {
    if (!['percentage', 'fixed'].includes(body.type)) {
      details.push({
        field: 'type',
        message: 'type must be percentage or fixed',
      });
    }
  }
  if (!isPatch || body.rate !== undefined) {
    if (typeof body.rate !== 'number' || body.rate < 0) {
      details.push({
        field: 'rate',
        message: 'rate must be a non-negative number',
      });
    } else if (body.type === 'fixed' && !Number.isInteger(body.rate)) {
      details.push({
        field: 'rate',
        message: 'Fixed tax rate must be an integer in paise',
      });
    }
  }
  if (!isPatch || body.appliesTo !== undefined) {
    const a = body.appliesTo;
    if (
      !a ||
      typeof a !== 'object' ||
      !['all', 'productTypes', 'products'].includes(a.kind)
    ) {
      details.push({
        field: 'appliesTo.kind',
        message: 'appliesTo.kind must be all, productTypes or products',
      });
    }
  }

  if (details.length > 0) {
    throw Errors.validation('Some fields are invalid', details);
  }
}

// GET /taxes
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

    if (req.query.isActive !== undefined) {
      params.push(req.query.isActive === 'true' || req.query.isActive === true);
      conditions.push(`is_active = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM taxes ${whereClause}`,
      params
    );
    const total = countRes.rows[0].total;

    const listRes = await db.query(
      `SELECT * FROM taxes ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      data: listRes.rows.map(formatTax),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  })
);

// POST /taxes
router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    validateTaxInput(body, false);

    const appliesTo = {
      kind: body.appliesTo.kind,
      productTypes: Array.isArray(body.appliesTo.productTypes)
        ? body.appliesTo.productTypes
        : [],
      productIds: Array.isArray(body.appliesTo.productIds)
        ? body.appliesTo.productIds
        : [],
    };

    const id = generateId();
    const ins = await db.query(
      `INSERT INTO taxes (id, name, type, rate, applies_to, is_active)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [
        id,
        body.name.trim(),
        body.type,
        body.rate,
        JSON.stringify(appliesTo),
        body.isActive !== undefined ? Boolean(body.isActive) : true,
      ]
    );

    return res.status(201).json({
      data: formatTax(ins.rows[0]),
    });
  })
);

// PATCH /taxes/:id
router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    validateTaxInput(body, true);

    const existingRes = await db.query(`SELECT * FROM taxes WHERE id = $1`, [
      id,
    ]);
    if (existingRes.rowCount === 0) {
      throw Errors.notFound();
    }
    const existing = existingRes.rows[0];

    const newAppliesTo =
      body.appliesTo !== undefined
        ? {
            kind: body.appliesTo.kind,
            productTypes: Array.isArray(body.appliesTo.productTypes)
              ? body.appliesTo.productTypes
              : existing.applies_to?.productTypes || [],
            productIds: Array.isArray(body.appliesTo.productIds)
              ? body.appliesTo.productIds
              : existing.applies_to?.productIds || [],
          }
        : existing.applies_to;

    const upd = await db.query(
      `UPDATE taxes
       SET name = $1,
           type = $2,
           rate = $3,
           applies_to = $4::jsonb,
           is_active = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        body.name !== undefined ? body.name.trim() : existing.name,
        body.type !== undefined ? body.type : existing.type,
        body.rate !== undefined ? body.rate : existing.rate,
        JSON.stringify(newAppliesTo),
        body.isActive !== undefined
          ? Boolean(body.isActive)
          : existing.is_active,
        id,
      ]
    );

    return res.status(200).json({
      data: formatTax(upd.rows[0]),
    });
  })
);

// DELETE /taxes/:id
router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const upd = await db.query(
      `UPDATE taxes SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (upd.rowCount === 0) {
      throw Errors.notFound();
    }
    return res.status(204).send();
  })
);

module.exports = router;



