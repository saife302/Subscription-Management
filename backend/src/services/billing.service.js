const db = require('../database/db.js');
const config = require('../config/index.js');
const { Errors } = require('../utils/errors.js');
const { generateId, nextNumber } = require('../utils/ids.js');
const {
  getTodayIST,
  addDaysStr,
  getPeriodEnd,
  daysBetween,
  toIsoString,
} = require('../utils/dates.js');
const { priceLines } = require('../utils/pricing.js');

function formatInvoiceListItem(row, today = getTodayIST()) {
  const balance = Number(row.balance);
  const isOverdue =
    row.status === 'confirmed' && balance > 0 && row.due_date < today;
  const daysOverdue = isOverdue ? Math.max(0, daysBetween(row.due_date, today)) : 0;

  return {
    id: row.id,
    number: row.number,
    customer: {
      id: row.customer_id,
      name: row.customer_name || row.customer_snapshot?.name || '',
    },
    subscription: {
      id: row.subscription_id,
      number: row.subscription_number || '',
    },
    periodStart: row.period_start,
    periodEnd: row.period_end,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    balance,
    status: row.status,
    isVoid: Boolean(row.is_void),
    isOverdue,
    daysOverdue,
  };
}

function getInvoiceAllowedActions(invoiceRow, userRole) {
  if (userRole === 'customer') return [];
  const actions = [];
  const status = invoiceRow.status;
  const amountPaid = Number(invoiceRow.amount_paid || 0);
  const balance = Number(invoiceRow.balance || 0);

  if (userRole === 'finance') {
    if (status === 'confirmed' || status === 'paid') {
      actions.push('send');
    }
    if (status === 'confirmed' && balance > 0) {
      actions.push('recordPayment');
    }
    return actions;
  }

  // Admin or Staff
  if (status === 'draft') {
    actions.push('edit', 'confirm', 'cancel');
  } else if (status === 'confirmed') {
    actions.push('send');
    if (balance > 0) {
      actions.push('recordPayment');
    }
    if (amountPaid === 0) {
      actions.push('cancel');
    }
  } else if (status === 'paid') {
    actions.push('send');
  }

  return actions;
}

async function getInvoiceDetail(invoiceId, userRole = 'admin', client = db) {
  const invRes = await client.query(
    `SELECT i.*,
            c.name AS customer_name,
            s.number AS subscription_number
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN subscriptions s ON s.id = i.subscription_id
     WHERE i.id = $1`,
    [invoiceId]
  );
  if (invRes.rowCount === 0) {
    return null;
  }
  const row = invRes.rows[0];
  const today = getTodayIST();
  const balance = Number(row.balance);
  const isOverdue =
    row.status === 'confirmed' && balance > 0 && row.due_date < today;
  const daysOverdue = isOverdue ? Math.max(0, daysBetween(row.due_date, today)) : 0;

  const payRes = await client.query(
    `SELECT p.*, u.name AS recorded_by_name
     FROM payments p
     LEFT JOIN users u ON u.id = p.recorded_by
     WHERE p.invoice_id = $1
     ORDER BY p.payment_date ASC, p.created_at ASC`,
    [invoiceId]
  );

  const payments = payRes.rows.map((p) => {
    const item = {
      id: p.id,
      method: p.method,
      amount: Number(p.amount),
      paymentDate: p.payment_date,
      note: p.note || '',
    };
    if (userRole !== 'customer') {
      item.recordedBy = {
        id: p.recorded_by,
        name: p.recorded_by_name || 'Staff',
      };
    }
    return item;
  });

  const detail = {
    id: row.id,
    number: row.number,
    status: row.status,
    isVoid: Boolean(row.is_void),
    subscription: {
      id: row.subscription_id,
      number: row.subscription_number || '',
    },
    customer: {
      id: row.customer_id,
      name: row.customer_name || row.customer_snapshot?.name || '',
    },
    customerSnapshot: row.customer_snapshot || {},
    company: config.company,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    lines: row.lines || [],
    orderDiscount: row.order_discount || null,
    untaxedAmount: Number(row.untaxed_amount),
    discountTotal: Number(row.discount_total),
    taxTotal: Number(row.tax_total),
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    balance,
    isOverdue,
    daysOverdue,
    payments,
    allowedActions: getInvoiceAllowedActions(row, userRole),
    sentAt: toIsoString(row.sent_at),
    sentCount: Number(row.sent_count || 0),
    confirmedAt: toIsoString(row.confirmed_at),
    paidAt: toIsoString(row.paid_at),
    cancelledAt: toIsoString(row.cancelled_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };

  if (userRole !== 'customer') {
    detail.createdBy = row.created_by;
  }

  return detail;
}

/**
 * Bills one period for an active subscription inside a database transaction.
 */
async function billOneSubscriptionPeriod(
  subscriptionId,
  asOfDate = getTodayIST(),
  createdBy = 'system'
) {
  const excludedDiscountIds = [];

  // Retry loop in case a discount with usageLimit gets exhausted mid-run
  while (true) {
    let exhaustedDiscountId = null;

    try {
      const createdInvoiceId = await db.withTransaction(async (client) => {
        const subRes = await client.query(
          `SELECT * FROM subscriptions WHERE id = $1`,
          [subscriptionId]
        );
        if (subRes.rowCount === 0) {
          throw Errors.notFound('Subscription not found');
        }
        const sub = subRes.rows[0];

        if (sub.status !== 'active') {
          throw Errors.invalidTransition(
            'Only active subscriptions can be invoiced'
          );
        }

        const periodStart = sub.next_invoice_date;
        if (!periodStart || periodStart > sub.expiry_date) {
          throw Errors.invalidTransition(
            'Next billing period is past the subscription expiry date'
          );
        }

        const planRes = await client.query(
          `SELECT * FROM plans WHERE id = $1`,
          [sub.plan_id]
        );
        const plan = planRes.rows[0];
        if (!plan) {
          throw Errors.notFound('Plan not found');
        }

        const custRes = await client.query(
          `SELECT * FROM customers WHERE id = $1`,
          [sub.customer_id]
        );
        const customer = custRes.rows[0];
        if (!customer) {
          throw Errors.notFound('Customer not found');
        }

        // Check if non-void invoice already exists for (subscriptionId, periodStart)
        const existingInv = await client.query(
          `SELECT id FROM invoices WHERE subscription_id = $1 AND period_start = $2 AND is_void = FALSE`,
          [sub.id, periodStart]
        );
        if (existingInv.rowCount > 0) {
          throw Errors.alreadyInvoiced();
        }

        const periodEnd = getPeriodEnd(periodStart, plan.billing_period);
        const invoiceDate = asOfDate;
        const dueDate = addDaysStr(
          invoiceDate,
          Number(sub.payment_term_days || 0)
        );

        const priced = await priceLines(sub, invoiceDate, {
          client,
          excludedDiscountIds,
        });

        // Reserve each applied discount's use conditionally
        for (const discId of priced.appliedDiscountIds) {
          const discUpd = await client.query(
            `UPDATE discounts
             SET used_count = used_count + 1, updated_at = NOW()
             WHERE id = $1 AND is_active = TRUE AND (usage_limit IS NULL OR used_count < usage_limit)
             RETURNING id`,
            [discId]
          );
          if (discUpd.rowCount === 0) {
            exhaustedDiscountId = discId;
            throw new Error('DISCOUNT_EXHAUSTED_RETRY');
          }
        }

        const invYear = invoiceDate.slice(0, 4);
        const invNumber = await nextNumber('INV', invYear, client);
        const invId = generateId();

        const invoiceLines = priced.lines.map((l) => ({
          id: l.id || generateId(),
          productId: l.productId,
          productName: l.productName,
          variantId: l.variantId,
          variantLabel: l.variantLabel,
          description: l.variantLabel
            ? `${l.productName} Â· ${l.variantLabel}`
            : l.productName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
          discount: l.discount,
          orderDiscountShare: l.orderDiscountShare,
          taxes: l.taxes,
          taxAmount: l.taxAmount,
          total: l.total,
        }));

        const customerSnapshot = {
          name: customer.name,
          email: customer.email,
          billingAddress: customer.billing_address || {},
          taxId: customer.tax_id || '',
        };

        const nextPointer = addDaysStr(periodEnd, 1);

        // Conditional pointer move on subscription
        const subUpd = await client.query(
          `UPDATE subscriptions
           SET next_invoice_date = $1, updated_at = NOW()
           WHERE id = $2 AND next_invoice_date = $3
           RETURNING id`,
          [nextPointer, sub.id, periodStart]
        );
        if (subUpd.rowCount === 0) {
          throw Errors.alreadyInvoiced();
        }

        await client.query(
          `INSERT INTO invoices (
             id, number, subscription_id, customer_id, customer_snapshot,
             period_start, period_end, invoice_date, due_date, status, is_void,
             lines, order_discount, untaxed_amount, discount_total, tax_total, total,
             amount_paid, balance, applied_discount_ids, sent_at, sent_count, created_by
           )
           VALUES (
             $1, $2, $3, $4, $5::jsonb,
             $6, $7, $8, $9, 'draft', FALSE,
             $10::jsonb, $11::jsonb, $12, $13, $14, $15,
             0, $15, $16::jsonb, NULL, 0, $17
           )`,
          [
            invId,
            invNumber,
            sub.id,
            customer.id,
            JSON.stringify(customerSnapshot),
            periodStart,
            periodEnd,
            invoiceDate,
            dueDate,
            JSON.stringify(invoiceLines),
            priced.orderDiscount ? JSON.stringify(priced.orderDiscount) : null,
            priced.totals.untaxedAmount,
            priced.totals.discountTotal,
            priced.totals.taxTotal,
            priced.totals.total,
            JSON.stringify(priced.appliedDiscountIds),
            createdBy,
          ]
        );

        return invId;
      });

      return createdInvoiceId;
    } catch (err) {
      if (err.message === 'DISCOUNT_EXHAUSTED_RETRY' && exhaustedDiscountId) {
        excludedDiscountIds.push(exhaustedDiscountId);
        continue;
      }
      if (err.code === '23505') {
        throw Errors.alreadyInvoiced();
      }
      throw err;
    }
  }
}

/**
 * Full billing run (Section 10):
 * 1. Automatic lifecycle changes (quotationsExpired, activated, autoClosed)
 * 2. Find due subscriptions and bill each period until caught up
 */
async function executeBillingRun({
  asOfDate = getTodayIST(),
  dryRun = false,
} = {}) {
  const startedAt = new Date();
  const nowIso = toIsoString(startedAt);

  const lifecycle = {
    quotationsExpired: 0,
    activated: 0,
    autoClosed: 0,
  };

  // 1. Automatic subscription changes
  // 1a. Quotations past quotationValidUntil -> Closed (quotation_expired)
  const expQuotesRes = await db.query(
    `SELECT * FROM subscriptions WHERE status = 'quotation' AND quotation_valid_until IS NOT NULL AND quotation_valid_until < $1`,
    [asOfDate]
  );
  lifecycle.quotationsExpired = expQuotesRes.rowCount;
  if (!dryRun) {
    for (const sub of expQuotesRes.rows) {
      const history = Array.isArray(sub.history) ? [...sub.history] : [];
      history.unshift({
        at: nowIso,
        by: 'system',
        action: 'expire',
        from: 'quotation',
        to: 'closed',
        note: 'Quotation expired',
      });
      await db.query(
        `UPDATE subscriptions
         SET status = 'closed', close_reason = 'quotation_expired', closed_at = NOW(), history = $1::jsonb, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(history), sub.id]
      );
    }
  }

  // 1b. Confirmed with startDate <= asOfDate -> Active, nextInvoiceDate = startDate
  const confSubsRes = await db.query(
    `SELECT * FROM subscriptions WHERE status = 'confirmed' AND start_date <= $1`,
    [asOfDate]
  );
  lifecycle.activated = confSubsRes.rowCount;
  if (!dryRun) {
    for (const sub of confSubsRes.rows) {
      const history = Array.isArray(sub.history) ? [...sub.history] : [];
      history.unshift({
        at: nowIso,
        by: 'system',
        action: 'activate',
        from: 'confirmed',
        to: 'active',
        note: null,
      });
      await db.query(
        `UPDATE subscriptions
         SET status = 'active', next_invoice_date = start_date, history = $1::jsonb, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(history), sub.id]
      );
    }
  }

  // 1c. Active or Paused past expiryDate
  const pastExpiryRes = await db.query(
    `SELECT s.*, pl.rules AS plan_rules
     FROM subscriptions s
     LEFT JOIN plans pl ON pl.id = s.plan_id
     WHERE s.status IN ('active', 'paused') AND s.expiry_date < $1`,
    [asOfDate]
  );
  for (const sub of pastExpiryRes.rows) {
    const autoClose = Boolean(sub.plan_rules?.autoClose);
    if (autoClose) {
      lifecycle.autoClosed += 1;
      if (!dryRun) {
        const history = Array.isArray(sub.history) ? [...sub.history] : [];
        history.unshift({
          at: nowIso,
          by: 'system',
          action: 'close',
          from: sub.status,
          to: 'closed',
          note: 'Auto-closed on expiry date',
        });
        await db.query(
          `UPDATE subscriptions
           SET status = 'closed', close_reason = 'expired', closed_at = NOW(), next_invoice_date = NULL, history = $1::jsonb, updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(history), sub.id]
        );
      }
    } else if (!dryRun && !sub.is_expired) {
      await db.query(
        `UPDATE subscriptions SET is_expired = TRUE, updated_at = NOW() WHERE id = $1`,
        [sub.id]
      );
    }
  }

  // 2. Find due subscriptions
  let dueSubs = [];
  if (dryRun) {
    // In dryRun, include currently active due subscriptions plus confirmed ones that would activate today
    const dueRes = await db.query(
      `SELECT s.*, pl.billing_period, pl.rules AS plan_rules
       FROM subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       WHERE (
         (s.status = 'active' AND NOT (s.expiry_date < $1 AND COALESCE((pl.rules->>'autoClose')::boolean, false) = true))
         OR (s.status = 'confirmed' AND s.start_date <= $1)
       )`,
      [asOfDate]
    );
    dueSubs = dueRes.rows.filter((s) => {
      const nextDate =
        s.status === 'confirmed' ? s.start_date : s.next_invoice_date;
      return nextDate && nextDate <= asOfDate && nextDate <= s.expiry_date;
    });
  } else {
    const dueRes = await db.query(
      `SELECT s.*, pl.billing_period
       FROM subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       WHERE s.status = 'active'
         AND s.next_invoice_date IS NOT NULL
         AND s.next_invoice_date <= $1
         AND s.next_invoice_date <= s.expiry_date
       ORDER BY s.next_invoice_date ASC`,
      [asOfDate]
    );
    dueSubs = dueRes.rows;
  }

  const dueSubscriptionsCount = dueSubs.length;
  let created = 0;
  let skippedAlreadyInvoiced = 0;
  const failed = [];
  const invoiceIds = [];

  for (const sub of dueSubs) {
    if (dryRun) {
      let ptr =
        sub.status === 'confirmed' ? sub.start_date : sub.next_invoice_date;
      while (ptr && ptr <= asOfDate && ptr <= sub.expiry_date) {
        const existingInv = await db.query(
          `SELECT id FROM invoices WHERE subscription_id = $1 AND period_start = $2 AND is_void = FALSE`,
          [sub.id, ptr]
        );
        if (existingInv.rowCount > 0) {
          skippedAlreadyInvoiced += 1;
        } else {
          created += 1;
        }
        const pEnd = getPeriodEnd(ptr, sub.billing_period);
        ptr = addDaysStr(pEnd, 1);
      }
      continue;
    }

    // Real run: catch up all due periods one by one
    while (true) {
      const curRes = await db.query(
        `SELECT s.next_invoice_date, s.expiry_date, s.status, s.number, pl.billing_period
         FROM subscriptions s
         JOIN plans pl ON pl.id = s.plan_id
         WHERE s.id = $1`,
        [sub.id]
      );
      const cur = curRes.rows[0];
      if (
        !cur ||
        cur.status !== 'active' ||
        !cur.next_invoice_date ||
        cur.next_invoice_date > asOfDate ||
        cur.next_invoice_date > cur.expiry_date
      ) {
        break;
      }

      try {
        const invId = await billOneSubscriptionPeriod(
          sub.id,
          asOfDate,
          'system'
        );
        created += 1;
        invoiceIds.push(invId);
      } catch (err) {
        if (err.code === 'ALREADY_INVOICED') {
          skippedAlreadyInvoiced += 1;
          // If pointer wasn't moved yet because an invoice already existed for this periodStart, advance pointer
          const nextPtr = addDaysStr(
            getPeriodEnd(cur.next_invoice_date, cur.billing_period),
            1
          );
          await db.query(
            `UPDATE subscriptions SET next_invoice_date = $1, updated_at = NOW() WHERE id = $2 AND next_invoice_date = $3`,
            [nextPtr, sub.id, cur.next_invoice_date]
          );
        } else {
          failed.push({
            subscriptionId: sub.id,
            number: sub.number,
            code: err.code || 'INTERNAL',
            message: err.message || 'Billing failed',
          });
          break;
        }
      }
    }
  }

  const finishedAt = new Date();
  const runResult = {
    asOfDate,
    dryRun: Boolean(dryRun),
    lifecycle,
    dueSubscriptions: dueSubscriptionsCount,
    created,
    skippedAlreadyInvoiced,
    failed,
    invoiceIds,
    startedAt: toIsoString(startedAt),
    finishedAt: toIsoString(finishedAt),
  };

  if (!dryRun) {
    await db.query(
      `INSERT INTO billing_runs (id, as_of_date, dry_run, lifecycle, due_subscriptions, created, skipped_already_invoiced, failed, invoice_ids, started_at, finished_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        generateId(),
        asOfDate,
        false,
        JSON.stringify(lifecycle),
        dueSubscriptionsCount,
        created,
        skippedAlreadyInvoiced,
        JSON.stringify(failed),
        JSON.stringify(invoiceIds),
        startedAt,
        finishedAt,
      ]
    );
  }

  return runResult;
}

module.exports = {
  formatInvoiceListItem,
  getInvoiceAllowedActions,
  getInvoiceDetail,
  billOneSubscriptionPeriod,
  executeBillingRun,
};



