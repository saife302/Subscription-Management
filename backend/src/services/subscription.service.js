const db = require('../database/db.js');
const config = require('../config/index.js');
const { Errors } = require('../utils/errors.js');
const { generateId } = require('../utils/ids.js');
const {
  getTodayIST,
  isValidDateStr,
  defaultExpiryDate,
  toIsoString,
} = require('../utils/dates.js');
const { priceLines } = require('../utils/pricing.js');

function computeAllowedActions(subRow, planRow, userRole, today = getTodayIST()) {
  if (userRole === 'finance') {
    return [];
  }

  const status = subRow.status;
  const rules = planRow?.rules || {};
  const lines = Array.isArray(subRow.lines) ? subRow.lines : [];

  if (userRole === 'customer') {
    const actions = [];
    if (status === 'quotation') {
      const notExpired =
        !subRow.quotation_valid_until || subRow.quotation_valid_until >= today;
      if (notExpired) {
        actions.push('accept', 'reject');
      }
    }
    if (config.customerSelfService) {
      if (status === 'active') {
        if (rules.pausable) actions.push('pause');
        if (rules.renewable) actions.push('renew');
        if (rules.closable || subRow.expiry_date < today) actions.push('close');
      } else if (status === 'paused') {
        actions.push('resume');
        if (rules.renewable) actions.push('renew');
        if (rules.closable || subRow.expiry_date < today) actions.push('close');
      }
    }
    return actions;
  }

  // Admin or Staff
  const actions = [];
  if (status === 'draft') {
    actions.push('edit', 'delete');
    if (lines.length > 0) actions.push('send');
    actions.push('cancel');
  } else if (status === 'quotation') {
    actions.push('edit');
    const notExpired =
      !subRow.quotation_valid_until || subRow.quotation_valid_until >= today;
    if (notExpired) {
      actions.push('confirm');
    }
    actions.push('cancel');
  } else if (status === 'confirmed') {
    actions.push('edit', 'activate', 'cancel');
  } else if (status === 'active') {
    actions.push('edit');
    if (rules.pausable) actions.push('pause');
    if (rules.renewable) actions.push('renew');
    if (rules.closable || subRow.expiry_date < today) actions.push('close');
    if (
      subRow.next_invoice_date &&
      subRow.next_invoice_date <= subRow.expiry_date
    ) {
      actions.push('createInvoice');
    }
  } else if (status === 'paused') {
    actions.push('edit', 'resume');
    if (rules.renewable) actions.push('renew');
    if (rules.closable || subRow.expiry_date < today) actions.push('close');
  }

  return actions;
}

async function resolveAndValidateLines({
  rawLines,
  plan,
  existingLines = [],
  allowOverrideUnitPrice = true,
}) {
  const existingMap = new Map(existingLines.map((l) => [l.id, l]));

  let linesToProcess = rawLines;
  if (!linesToProcess || linesToProcess.length === 0) {
    linesToProcess = [
      {
        productId: plan.product_id,
        variantId: null,
        quantity: Number(plan.min_quantity),
      },
    ];
  }

  const prodIds = [...new Set(linesToProcess.map((l) => l.productId))];
  const prodRes = await db.query(
    `SELECT * FROM products WHERE id = ANY($1::text[])`,
    [prodIds]
  );
  const prodMap = new Map(prodRes.rows.map((p) => [p.id, p]));

  let planProductQty = 0;
  const resolvedLines = [];

  for (let i = 0; i < linesToProcess.length; i++) {
    const item = linesToProcess[i];
    if (
      !item ||
      typeof item.productId !== 'string' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw Errors.validation('Some fields are invalid', [
        {
          field: `lines.${i}`,
          message: 'Each line requires productId and integer quantity >= 1',
        },
      ]);
    }

    const product = prodMap.get(item.productId);
    if (!product || !product.is_active) {
      throw Errors.validation('Some fields are invalid', [
        {
          field: `lines.${i}.productId`,
          message: 'Product does not exist or is inactive',
        },
      ]);
    }

    let variantLabel = null;
    let extraPrice = 0;
    const variantId = item.variantId || null;

    if (variantId) {
      const variant = (product.variants || []).find((v) => v.id === variantId);
      if (!variant) {
        throw Errors.validation('Some fields are invalid', [
          {
            field: `lines.${i}.variantId`,
            message: 'Variant does not exist on this product',
          },
        ]);
      }
      variantLabel = `${variant.attribute}: ${variant.value}`;
      extraPrice = Number(variant.extraPrice || 0);
    }

    const defaultUnitPrice =
      product.id === plan.product_id
        ? Number(plan.price) + extraPrice
        : Number(product.sales_price) + extraPrice;

    let unitPrice = defaultUnitPrice;
    const existingLine = item.id ? existingMap.get(item.id) : null;

    if (item.unitPrice !== undefined && item.unitPrice !== null) {
      if (!Number.isInteger(item.unitPrice) || item.unitPrice < 0) {
        throw Errors.validation('Some fields are invalid', [
          {
            field: `lines.${i}.unitPrice`,
            message: 'unitPrice must be an integer >= 0 (in paise)',
          },
        ]);
      }
      if (allowOverrideUnitPrice) {
        unitPrice = Number(item.unitPrice);
      } else if (existingLine) {
        unitPrice = Number(existingLine.unitPrice);
      }
    } else if (
      existingLine &&
      existingLine.productId === item.productId &&
      (existingLine.variantId || null) === variantId
    ) {
      unitPrice = Number(existingLine.unitPrice);
    }

    if (product.id === plan.product_id) {
      planProductQty += item.quantity;
    }

    resolvedLines.push({
      id: item.id || generateId(),
      productId: product.id,
      productName: product.name,
      variantId,
      variantLabel,
      quantity: Number(item.quantity),
      unitPrice,
    });
  }

  if (planProductQty < Number(plan.min_quantity)) {
    throw Errors.belowMinQuantity();
  }

  return resolvedLines;
}

async function getSubscriptionDetail(subId, userRole = 'admin') {
  const subRes = await db.query(`SELECT * FROM subscriptions WHERE id = $1`, [
    subId,
  ]);
  if (subRes.rowCount === 0) {
    return null;
  }
  const sub = subRes.rows[0];

  const [custRes, planRes, tplRes, salesRes, invStatsRes, lastInvRes] =
    await Promise.all([
      db.query(`SELECT id, name, email FROM customers WHERE id = $1`, [
        sub.customer_id,
      ]),
      db.query(`SELECT * FROM plans WHERE id = $1`, [sub.plan_id]),
      sub.template_id
        ? db.query(`SELECT id, name FROM quotation_templates WHERE id = $1`, [
            sub.template_id,
          ])
        : Promise.resolve({ rows: [] }),
      sub.salesperson_id
        ? db.query(`SELECT id, name FROM users WHERE id = $1`, [
            sub.salesperson_id,
          ])
        : Promise.resolve({ rows: [] }),
      db.query(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(CASE WHEN status = 'confirmed' THEN balance ELSE 0 END), 0) AS outstanding_amount
         FROM invoices
         WHERE subscription_id = $1 AND status != 'draft'`,
        [sub.id]
      ),
      db.query(
        `SELECT id, number, status
         FROM invoices
         WHERE subscription_id = $1 AND ($2 != 'customer' OR status != 'draft')
         ORDER BY created_at DESC
         LIMIT 1`,
        [sub.id, userRole]
      ),
    ]);

  // For staff/admin/finance, invoiceSummary counts all non-void or all invoices
  const staffInvStatsRes =
    userRole === 'customer'
      ? invStatsRes
      : await db.query(
          `SELECT COUNT(*)::int AS count,
                  COALESCE(SUM(CASE WHEN status = 'confirmed' THEN balance ELSE 0 END), 0) AS outstanding_amount
           FROM invoices
           WHERE subscription_id = $1`,
          [sub.id]
        );

  const customer = custRes.rows[0];
  const plan = planRes.rows[0];
  const template = tplRes.rows[0] || null;
  const salesperson = salesRes.rows[0] || null;

  const today = getTodayIST();
  const priced = await priceLines(sub, today);

  // Resolve actor names in history
  const rawHistory = Array.isArray(sub.history) ? sub.history : [];
  const userIdsInHistory = [
    ...new Set(
      rawHistory
        .map((h) => (typeof h.by === 'string' ? h.by : h.by?.id))
        .filter((id) => id && id !== 'system')
    ),
  ];
  const histUsersRes =
    userIdsInHistory.length > 0
      ? await db.query(
          `SELECT id, name FROM users WHERE id = ANY($1::text[])`,
          [userIdsInHistory]
        )
      : { rows: [] };
  const histUserMap = new Map(histUsersRes.rows.map((u) => [u.id, u.name]));

  const formattedHistory = rawHistory.map((h) => {
    let byObj;
    if (typeof h.by === 'object' && h.by !== null) {
      byObj = h.by;
    } else if (h.by === 'system' || !h.by) {
      byObj = { id: 'system', name: 'System' };
    } else {
      byObj = {
        id: h.by,
        name: histUserMap.get(h.by) || 'User',
      };
    }
    return {
      at: h.at,
      by: byObj,
      action: h.action,
      from: h.from ?? null,
      to: h.to ?? null,
      note: h.note ?? null,
    };
  });

  const isExpired =
    Boolean(sub.is_expired) ||
    (['active', 'paused'].includes(sub.status) && sub.expiry_date < today);

  const detail = {
    id: sub.id,
    number: sub.number,
    status: sub.status,
    customer: customer
      ? { id: customer.id, name: customer.name, email: customer.email }
      : { id: sub.customer_id, name: '' },
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          billingPeriod: plan.billing_period,
          minQuantity: Number(plan.min_quantity),
          rules: plan.rules || {},
        }
      : null,
    template: template ? { id: template.id, name: template.name } : null,
    startDate: sub.start_date,
    expiryDate: sub.expiry_date,
    isExpired,
    quotationValidUntil: sub.quotation_valid_until || null,
    paymentTermDays: Number(sub.payment_term_days),
    nextInvoiceDate: sub.next_invoice_date || null,
    lines: priced.lines,
    orderDiscount: priced.orderDiscount,
    totals: priced.totals,
    recurringTotal: priced.recurringTotal,
    recurringNet: priced.recurringNet,
    allowedActions: computeAllowedActions(sub, plan, userRole, today),
    invoiceSummary: {
      count: Number(staffInvStatsRes.rows[0].count || 0),
      outstandingAmount: Number(
        staffInvStatsRes.rows[0].outstanding_amount || 0
      ),
      lastInvoice: lastInvRes.rows[0]
        ? {
            id: lastInvRes.rows[0].id,
            number: lastInvRes.rows[0].number,
            status: lastInvRes.rows[0].status,
          }
        : null,
    },
    pausedAt: toIsoString(sub.paused_at),
    closedAt: toIsoString(sub.closed_at),
    closeReason: sub.close_reason || null,
    createdAt: toIsoString(sub.created_at),
    updatedAt: toIsoString(sub.updated_at),
  };

  if (userRole !== 'customer') {
    detail.salesperson = salesperson
      ? { id: salesperson.id, name: salesperson.name }
      : null;
    detail.notes = sub.notes || '';
    detail.history = formattedHistory;
  }

  return detail;
}

function checkPlanAvailability(plan, startDate) {
  if (!plan.is_active) {
    throw Errors.planNotAvailable('Plan is not active');
  }
  if (startDate < plan.available_from) {
    throw Errors.planNotAvailable(
      'Start date is before plan availableFrom date'
    );
  }
  if (plan.available_until && startDate > plan.available_until) {
    throw Errors.planNotAvailable(
      'Start date is after plan availableUntil date'
    );
  }
}

module.exports = {
  computeAllowedActions,
  resolveAndValidateLines,
  getSubscriptionDetail,
  checkPlanAvailability,
};



