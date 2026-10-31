const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const { toIsoString } = require('../../utils/dates.js');

const router = express.Router();

router.use(authenticate);

function formatProduct(row, usedInPlans = 0) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    salesPrice: Number(row.sales_price),
    costPrice: Number(row.cost_price),
    notes: row.notes || '',
    variants: Array.isArray(row.variants) ? row.variants : [],
    usedInPlans: Number(usedInPlans),
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function validateProductInput(body, isPatch = false) {
  const details = [];

  if (!isPatch || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      details.push({ field: 'name', message: 'Product name is required' });
    }
  }

  if (!isPatch || body.type !== undefined) {
    if (!['service', 'addon', 'physical'].includes(body.type)) {
      details.push({
        field: 'type',
        message: 'Type must be service, addon or physical',
      });
    }
  }

  if (!isPatch || body.salesPrice !== undefined) {
    if (!Number.isInteger(body.salesPrice) || body.salesPrice < 0) {
      details.push({
        field: 'salesPrice',
        message: 'salesPrice must be an integer >= 0 (in paise)',
      });
    }
  }

  if (body.costPrice !== undefined) {
    if (!Number.isInteger(body.costPrice) || body.costPrice < 0) {
      details.push({
        field: 'costPrice',
        message: 'costPrice must be an integer >= 0 (in paise)',
      });
    }
  }

  if (body.variants !== undefined) {
    if (!Array.isArray(body.variants)) {
      details.push({ field: 'variants', message: 'variants must be an array' });
    } else {
      body.variants.forEach((v, idx) => {
        if (!v || typeof v.attribute !== 'string' || !v.attribute.trim()) {
          details.push({
            field: `variants.${idx}.attribute`,
            message: 'Variant attribute is required',
          });
        }
        if (!v || typeof v.value !== 'string' || !v.value.trim()) {
          details.push({
            field: `variants.${idx}.value`,
            message: 'Variant value is required',
          });
        }
        if (
          !v ||
          !Number.isInteger(v.extraPrice) ||
          v.extraPrice < 0
        ) {
          details.push({
            field: `variants.${idx}.extraPrice`,
            message: 'Variant extraPrice must be an integer >= 0 (in paise)',
          });
        }
      });
    }
  }

  if (details.length > 0) {
    throw Errors.validation('Some fields are invalid', details);
  }
}

// GET /products
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
      conditions.push(`p.name ILIKE $${params.length}`);
    }
    if (req.query.type) {
      params.push(String(req.query.type));
      conditions.push(`p.type = $${params.length}`);
    }
    if (req.query.isActive !== undefined) {
      params.push(req.query.isActive === 'true' || req.query.isActive === true);
      conditions.push(`p.is_active = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM products p ${whereClause}`,
      params
    );
    const total = countRes.rows[0].total;

    const listRes = await db.query(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM plans pl WHERE pl.product_id = p.id) AS used_in_plans
       FROM products p
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      data: listRes.rows.map((r) => formatProduct(r, r.used_in_plans)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  })
);

// POST /products
router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    validateProductInput(body, false);

    const id = generateId();
    const variants = (body.variants || []).map((v) => ({
      id: v.id || generateId(),
      attribute: v.attribute.trim(),
      value: v.value.trim(),
      extraPrice: Number(v.extraPrice),
    }));

    const ins = await db.query(
      `INSERT INTO products (id, name, type, sales_price, cost_price, notes, variants, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [
        id,
        body.name.trim(),
        body.type,
        body.salesPrice,
        body.costPrice ?? 0,
        body.notes ?? '',
        JSON.stringify(variants),
        body.isActive !== undefined ? Boolean(body.isActive) : true,
      ]
    );

    return res.status(201).json({
      data: formatProduct(ins.rows[0], 0),
    });
  })
);

// GET /products/:id
router.get(
  '/:id',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prodRes = await db.query(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM plans pl WHERE pl.product_id = p.id) AS used_in_plans
       FROM products p
       WHERE p.id = $1`,
      [id]
    );
    if (prodRes.rowCount === 0) {
      throw Errors.notFound();
    }
    const row = prodRes.rows[0];
    return res.status(200).json({
      data: formatProduct(row, row.used_in_plans),
    });
  })
);

// PATCH /products/:id
router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    validateProductInput(body, true);

    const prodRes = await db.query(`SELECT * FROM products WHERE id = $1`, [
      id,
    ]);
    if (prodRes.rowCount === 0) {
      throw Errors.notFound();
    }
    const existing = prodRes.rows[0];

    let newVariants = existing.variants || [];
    if (body.variants !== undefined) {
      const incomingIds = new Set(
        body.variants.filter((v) => v.id).map((v) => v.id)
      );
      const removedVariantIds = (existing.variants || [])
        .map((v) => v.id)
        .filter((vid) => !incomingIds.has(vid));

      if (removedVariantIds.length > 0) {
        // Check if any active subscription uses any of the removed variants
        const activeSubsRes = await db.query(
          `SELECT lines FROM subscriptions WHERE status = 'active'`
        );
        for (const subRow of activeSubsRes.rows) {
          const lines = subRow.lines || [];
          for (const line of lines) {
            if (line.variantId && removedVariantIds.includes(line.variantId)) {
              throw Errors.notEditable(
                'Cannot remove a variant used by an active subscription'
              );
            }
          }
        }
      }

      newVariants = body.variants.map((v) => ({
        id: v.id || generateId(),
        attribute: v.attribute.trim(),
        value: v.value.trim(),
        extraPrice: Number(v.extraPrice),
      }));
    }

    const upd = await db.query(
      `UPDATE products
       SET name = $1,
           type = $2,
           sales_price = $3,
           cost_price = $4,
           notes = $5,
           variants = $6::jsonb,
           is_active = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        body.name !== undefined ? body.name.trim() : existing.name,
        body.type !== undefined ? body.type : existing.type,
        body.salesPrice !== undefined ? body.salesPrice : existing.sales_price,
        body.costPrice !== undefined ? body.costPrice : existing.cost_price,
        body.notes !== undefined ? body.notes : existing.notes,
        JSON.stringify(newVariants),
        body.isActive !== undefined
          ? Boolean(body.isActive)
          : existing.is_active,
        id,
      ]
    );

    const usedRes = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM plans WHERE product_id = $1`,
      [id]
    );

    return res.status(200).json({
      data: formatProduct(upd.rows[0], usedRes.rows[0].cnt),
    });
  })
);

// DELETE /products/:id
router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const upd = await db.query(
      `UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (upd.rowCount === 0) {
      throw Errors.notFound();
    }
    return res.status(204).send();
  })
);

module.exports = router;



