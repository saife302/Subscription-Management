const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId, nextNumber } = require('../../utils/ids.js');
const {
  getTodayIST,
  isValidDateStr,
  addDaysStr,
  addBillingPeriod,
  defaultExpiryDate,
  toIsoString,
} = require('../../utils/dates.js');
const { priceLines } = require('../../utils/pricing.js');
const { sendQuotation } = require('../../services/mailer.service.js');
const {
  resolveAndValidateLines,
  getSubscriptionDetail,
  checkPlanAvailability,
} = require('../../services/subscription.service.js');
const {
  billOneSubscriptionPeriod,
  getInvoiceDetail,
} = require('../../services/billing.service.js');

const router = express.Router();

router.use(authenticate);

async function buildSubscriptionDraftPayload(body, userId) {
  let template = null;
  if (body.templateId) {
    const tplRes = await db.query(
      `SELECT * FROM quotation_templates WHERE id = $1`,
      [body.templateId]
    );
    if (tplRes.rowCount === 0 || !tplRes.rows[0].is_active) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'templateId', message: 'Quotation template not found' },
      ]);
    }
    template = tplRes.rows[0];
  }

  const customerId = body.customerId;
  const planId = body.planId || template?.plan_id;
  const startDate = body.startDate || getTodayIST();

  const details = [];
  if (!customerId || typeof customerId !== 'string') {
    details.push({ field: 'customerId', message: 'customerId is required' });
  }
  if (!planId || typeof planId !== 'string') {
    details.push({
      field: 'planId',
      message: 'planId (or templateId) is required',
    });
  }
  if (!isValidDateStr(startDate)) {
    details.push({
      field: 'startDate',
      message: 'startDate must be YYYY-MM-DD',
    });
  }
  if (details.length > 0) {
    throw Errors.validation('Some fields are invalid', details);
  }

  const [custRes, planRes] = await Promise.all([
    db.query(`SELECT * FROM customers WHERE id = $1`, [customerId]),
    db.query(`SELECT * FROM plans WHERE id = $1`, [planId]),
  ]);

  if (custRes.rowCount === 0 || !custRes.rows[0].is_active) {
    throw Errors.validation('Some fields are invalid', [
      { field: 'customerId', message: 'Customer not found or inactive' },
    ]);
  }
  if (planRes.rowCount === 0) {
    throw Errors.validation('Some fields are invalid', [
      { field: 'planId', message: 'Plan not found' },
    ]);
  }
  const plan = planRes.rows[0];

  checkPlanAvailability(plan, startDate);

  const expiryDate = body.expiryDate || defaultExpiryDate(startDate);
  if (!isValidDateStr(expiryDate) || expiryDate < startDate) {
    throw Errors.validation('Some fields are invalid', [
      {
        field: 'expiryDate',
        message: 'expiryDate must be YYYY-MM-DD and >= startDate',
      },
    ]);
  }

  const paymentTermDays =
    body.paymentTermDays !== undefined
      ? Number(body.paymentTermDays)
      : template
      ? Number(template.payment_term_days)
      : 0;

  if (![0, 15, 30, 45].includes(paymentTermDays)) {
    throw Errors.validation('Some fields are invalid', [
      {
        field: 'paymentTermDays',
        message: 'paymentTermDays must be 0, 15, 30 or 45',
      },
    ]);
  }

  const rawLines =
    body.lines !== undefined
      ? body.lines
      : template
      ? template.lines
      : undefined;

  const lines = await resolveAndValidateLines({
    rawLines,
    plan,
    existingLines: [],
    allowOverrideUnitPrice: true,
  });

  const salespersonId =
    body.salespersonId !== undefined ? body.salespersonId : userId;
  const notes =
    body.notes !== undefined
      ? String(body.notes)
      : template
      ? template.notes || ''
      : '';

  return {
    customerId,
    planId: plan.id,
    plan,
    templateId: template ? template.id : null,
    salespersonId,
    startDate,
    expiryDate,
    paymentTermDays,
    lines,
    notes,
  };
}

// GET /subscriptions
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

    const baseConditions = [];
    const baseParams = [];

    if (req.query.customerId) {
      baseParams.push(String(req.query.customerId));
      baseConditions.push(`s.customer_id = $${baseParams.length}`);
    }
    if (req.query.planId) {
      baseParams.push(String(req.query.planId));
      baseConditions.push(`s.plan_id = $${baseParams.length}`);
    }
    if (req.query.search) {
      baseParams.push(`%${String(req.query.search).trim()}%`);
      baseConditions.push(
        `(s.number ILIKE $${baseParams.length} OR c.name ILIKE $${baseParams.length})`
      );
    }
    if (req.query.startFrom) {
      baseParams.push(String(req.query.startFrom));
      baseConditions.push(`s.start_date >= $${baseParams.length}`);
    }
    if (req.query.startTo) {
      baseParams.push(String(req.query.startTo));
      baseConditions.push(`s.start_date <= $${baseParams.length}`);
    }
    if (req.query.expiringBefore) {
      baseParams.push(String(req.query.expiringBefore));
      baseConditions.push(`s.expiry_date <= $${baseParams.length}`);
    }

    const baseWhere =
      baseConditions.length > 0
        ? `WHERE ${baseConditions.join(' AND ')}`
        : '';

    // Compute statusCounts ignoring status filter
    const countsRes = await db.query(
      `SELECT s.status, COUNT(*)::int AS cnt
       FROM subscriptions s
       LEFT JOIN customers c ON c.id = s.customer_id
       ${baseWhere}
       GROUP BY s.status`,
      baseParams
    );

    const statusCounts = {
      draft: 0,
      quotation: 0,
      confirmed: 0,
      active: 0,
      paused: 0,
      closed: 0,
    };
    for (const r of countsRes.rows) {
      if (statusCounts[r.status] !== undefined) {
        statusCounts[r.status] = r.cnt;
      }
    }

    const listConditions = [...baseConditions];
    const listParams = [...baseParams];
    if (req.query.status) {
      listParams.push(String(req.query.status));
      listConditions.push(`s.status = $${listParams.length}`);
    }

    const listWhere =
      listConditions.length > 0
        ? `WHERE ${listConditions.join(' AND ')}`
        : '';

    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM subscriptions s
       LEFT JOIN customers c ON c.id = s.customer_id
       ${listWhere}`,
      listParams
    );
    const total = totalRes.rows[0].total;

    const listRes = await db.query(
      `SELECT s.*,
              c.name AS customer_name,
              pl.name AS plan_name,
              pl.billing_period AS plan_billing_period
       FROM subscriptions s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN plans pl ON pl.id = s.plan_id
       ${listWhere}
       ORDER BY s.created_at DESC
       LIMIT $${listParams.length + 1} OFFSET $${listParams.length + 2}`,
      [...listParams, limit, offset]
    );

    const data = listRes.rows.map((r) => ({
      id: r.id,
      number: r.number,
      customer: {
        id: r.customer_id,
        name: r.customer_name || '',
      },
      plan: {
        id: r.plan_id,
        name: r.plan_name || '',
        billingPeriod: r.plan_billing_period || 'monthly',
      },
      status: r.status,
      startDate: r.start_date,
      expiryDate: r.expiry_date,
      nextInvoiceDate: r.next_invoice_date || null,
      recurringTotal: Number(r.recurring_total),
    }));

    return res.status(200).json({
      data,
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

// POST /subscriptions/preview
router.post(
  '/preview',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const draft = await buildSubscriptionDraftPayload(
      req.body || {},
      req.user.id
    );
    const priced = await priceLines(
      { lines: draft.lines },
      getTodayIST()
    );
    return res.status(200).json({
      data: {
        lines: priced.lines,
        orderDiscount: priced.orderDiscount,
        totals: priced.totals,
      },
    });
  })
);

// POST /subscriptions
router.post(
  '/',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const draft = await buildSubscriptionDraftPayload(
      req.body || {},
      req.user.id
    );
    const today = getTodayIST();
    const priced = await priceLines({ lines: draft.lines }, today);

    const id = generateId();
    const year = draft.startDate.slice(0, 4);
    const number = await nextNumber('SUB', year);
    const nowIso = toIsoString(new Date());

    const history = [
      {
        at: nowIso,
        by: req.user.id,
        action: 'create',
        from: null,
        to: 'draft',
        note: null,
      },
    ];

    await db.query(
      `INSERT INTO subscriptions (
         id, number, customer_id, plan_id, template_id, salesperson_id,
         status, start_date, expiry_date, is_expired, quotation_valid_until,
         payment_term_days, lines, next_invoice_date, recurring_total, recurring_net,
         notes, history
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         'draft', $7, $8, FALSE, NULL,
         $9, $10::jsonb, NULL, $11, $12,
         $13, $14::jsonb
       )`,
      [
        id,
        number,
        draft.customerId,
        draft.planId,
        draft.templateId,
        draft.salespersonId,
        draft.startDate,
        draft.expiryDate,
        draft.paymentTermDays,
        JSON.stringify(draft.lines),
        priced.recurringTotal,
        priced.recurringNet,
        draft.notes,
        JSON.stringify(history),
      ]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(201).json({ data: detail });
  })
);

// GET /subscriptions/:id
router.get(
  '/:id',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const detail = await getSubscriptionDetail(req.params.id, req.user.role);
    if (!detail) {
      throw Errors.notFound();
    }
    return res.status(200).json({ data: detail });
  })
);

// PATCH /subscriptions/:id
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

    const subRes = await db.query(`SELECT * FROM subscriptions WHERE id = $1`, [
      id,
    ]);
    if (subRes.rowCount === 0) {
      throw Errors.notFound();
    }
    const sub = subRes.rows[0];

    if (sub.status === 'closed') {
      throw Errors.notEditable('Closed subscriptions cannot be edited');
    }

    if (sub.status === 'confirmed') {
      if (
        (body.customerId !== undefined &&
          body.customerId !== sub.customer_id) ||
        (body.planId !== undefined && body.planId !== sub.plan_id) ||
        (body.paymentTermDays !== undefined &&
          Number(body.paymentTermDays) !== Number(sub.payment_term_days))
      ) {
        throw Errors.notEditable(
          'Only dates, salesperson, notes and lines can be edited when Confirmed'
        );
      }
    }

    if (sub.status === 'active' || sub.status === 'paused') {
      if (
        (body.customerId !== undefined &&
          body.customerId !== sub.customer_id) ||
        (body.planId !== undefined && body.planId !== sub.plan_id) ||
        (body.startDate !== undefined && body.startDate !== sub.start_date) ||
        (body.expiryDate !== undefined &&
          body.expiryDate !== sub.expiry_date) ||
        (body.paymentTermDays !== undefined &&
          Number(body.paymentTermDays) !== Number(sub.payment_term_days))
      ) {
        throw Errors.notEditable(
          'Only lines, salesperson and notes can be edited on an Active or Paused subscription'
        );
      }
    }

    const newCustomerId =
      body.customerId !== undefined ? body.customerId : sub.customer_id;
    const newPlanId = body.planId !== undefined ? body.planId : sub.plan_id;
    const newStartDate =
      body.startDate !== undefined ? body.startDate : sub.start_date;
    const newExpiryDate =
      body.expiryDate !== undefined ? body.expiryDate : sub.expiry_date;
    const newPaymentTerms =
      body.paymentTermDays !== undefined
        ? Number(body.paymentTermDays)
        : Number(sub.payment_term_days);
    const newSalespersonId =
      body.salespersonId !== undefined
        ? body.salespersonId
        : sub.salesperson_id;
    const newNotes =
      body.notes !== undefined ? String(body.notes) : sub.notes;

    if (!isValidDateStr(newStartDate)) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'startDate', message: 'startDate must be YYYY-MM-DD' },
      ]);
    }
    if (!isValidDateStr(newExpiryDate) || newExpiryDate < newStartDate) {
      throw Errors.validation('Some fields are invalid', [
        {
          field: 'expiryDate',
          message: 'expiryDate must be YYYY-MM-DD and >= startDate',
        },
      ]);
    }

    const planRes = await db.query(`SELECT * FROM plans WHERE id = $1`, [
      newPlanId,
    ]);
    if (planRes.rowCount === 0) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'planId', message: 'Plan not found' },
      ]);
    }
    const plan = planRes.rows[0];

    if (
      body.planId !== undefined ||
      body.startDate !== undefined
    ) {
      checkPlanAvailability(plan, newStartDate);
    }

    let newLines = sub.lines || [];
    if (body.lines !== undefined) {
      if (!Array.isArray(body.lines) || body.lines.length === 0) {
        throw Errors.belowMinQuantity();
      }
      const allowOverride = ['draft', 'quotation'].includes(sub.status);
      newLines = await resolveAndValidateLines({
        rawLines: body.lines,
        plan,
        existingLines: sub.lines || [],
        allowOverrideUnitPrice: allowOverride,
      });
    }

    const priced = await priceLines({ lines: newLines }, getTodayIST());
    const history = Array.isArray(sub.history) ? [...sub.history] : [];

    if (sub.status === 'quotation') {
      history.unshift({
        at: toIsoString(new Date()),
        by: req.user.id,
        action: 'edit',
        from: 'quotation',
        to: 'quotation',
        note: 'Quotation edited',
      });
    }

    await db.query(
      `UPDATE subscriptions
       SET customer_id = $1,
           plan_id = $2,
           start_date = $3,
           expiry_date = $4,
           payment_term_days = $5,
           salesperson_id = $6,
           notes = $7,
           lines = $8::jsonb,
           recurring_total = $9,
           recurring_net = $10,
           history = $11::jsonb,
           updated_at = NOW()
       WHERE id = $12`,
      [
        newCustomerId,
        newPlanId,
        newStartDate,
        newExpiryDate,
        newPaymentTerms,
        newSalespersonId,
        newNotes,
        JSON.stringify(newLines),
        priced.recurringTotal,
        priced.recurringNet,
        JSON.stringify(history),
        id,
      ]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// DELETE /subscriptions/:id
router.delete(
  '/:id',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(
      `SELECT id, status FROM subscriptions WHERE id = $1`,
      [id]
    );
    if (subRes.rowCount === 0) {
      throw Errors.notFound();
    }
    if (subRes.rows[0].status !== 'draft') {
      throw Errors.invalidTransition('Only draft subscriptions can be deleted');
    }
    await db.query(`DELETE FROM subscriptions WHERE id = $1`, [id]);
    return res.status(204).send();
  })
);

// POST /subscriptions/:id/send (Draft -> Quotation)
router.post(
  '/:id/send',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(`SELECT * FROM subscriptions WHERE id = $1`, [
      id,
    ]);
    if (subRes.rowCount === 0) throw Errors.notFound();
    const sub = subRes.rows[0];

    if (sub.status !== 'draft') {
      throw Errors.invalidTransition(
        'Only draft subscriptions can be sent as a quotation'
      );
    }
    if (!Array.isArray(sub.lines) || sub.lines.length === 0) {
      throw Errors.invalidTransition('Subscription must have at least one line');
    }

    let validityDays = 14;
    if (sub.template_id) {
      const tplRes = await db.query(
        `SELECT validity_days FROM quotation_templates WHERE id = $1`,
        [sub.template_id]
      );
      if (tplRes.rows[0]) {
        validityDays = Number(tplRes.rows[0].validity_days || 14);
      }
    }

    const today = getTodayIST();
    const quotationValidUntil = addDaysStr(today, validityDays);

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'send',
      from: 'draft',
      to: 'quotation',
      note: req.body?.note || null,
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'quotation',
           quotation_valid_until = $1,
           history = $2::jsonb,
           updated_at = NOW()
       WHERE id = $3`,
      [quotationValidUntil, JSON.stringify(history), id]
    );

    // Email customer if they have a login
    const custRes = await db.query(`SELECT * FROM customers WHERE id = $1`, [
      sub.customer_id,
    ]);
    const cust = custRes.rows[0];
    if (cust && cust.user_id) {
      await sendQuotation({
        email: cust.email,
        name: cust.name,
        subscriptionNumber: sub.number,
        validUntil: quotationValidUntil,
        totalPaise: Number(sub.recurring_total),
      });
    }

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /subscriptions/:id/confirm (Quotation -> Confirmed, or straight to Active if startDate <= today)
router.post(
  '/:id/confirm',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(`SELECT * FROM subscriptions WHERE id = $1`, [
      id,
    ]);
    if (subRes.rowCount === 0) throw Errors.notFound();
    const sub = subRes.rows[0];

    if (sub.status !== 'quotation') {
      throw Errors.invalidTransition(
        'Only quotations can be confirmed'
      );
    }

    const today = getTodayIST();
    if (sub.quotation_valid_until && sub.quotation_valid_until < today) {
      throw Errors.invalidTransition('Quotation has expired');
    }

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    const nowIso = toIsoString(new Date());

    let newStatus = 'confirmed';
    let nextInvoiceDate = sub.next_invoice_date;

    history.unshift({
      at: nowIso,
      by: req.user.id,
      action: 'confirm',
      from: 'quotation',
      to: 'confirmed',
      note: req.body?.note || null,
    });

    if (sub.start_date <= today) {
      newStatus = 'active';
      nextInvoiceDate = sub.start_date;
      history.unshift({
        at: nowIso,
        by: 'system',
        action: 'activate',
        from: 'confirmed',
        to: 'active',
        note: null,
      });
    }

    await db.query(
      `UPDATE subscriptions
       SET status = $1,
           next_invoice_date = $2,
           history = $3::jsonb,
           updated_at = NOW()
       WHERE id = $4`,
      [newStatus, nextInvoiceDate, JSON.stringify(history), id]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /subscriptions/:id/activate (Confirmed -> Active)
router.post(
  '/:id/activate',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(`SELECT * FROM subscriptions WHERE id = $1`, [
      id,
    ]);
    if (subRes.rowCount === 0) throw Errors.notFound();
    const sub = subRes.rows[0];

    if (sub.status !== 'confirmed') {
      throw Errors.invalidTransition(
        'Only confirmed subscriptions can be activated'
      );
    }

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'activate',
      from: 'confirmed',
      to: 'active',
      note: req.body?.note || null,
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'active',
           next_invoice_date = start_date,
           history = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(history), id]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /subscriptions/:id/pause (Active -> Paused)
router.post(
  '/:id/pause',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(
      `SELECT s.*, pl.rules AS plan_rules
       FROM subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       WHERE s.id = $1`,
      [id]
    );
    if (subRes.rowCount === 0) throw Errors.notFound();
    const sub = subRes.rows[0];

    if (sub.status !== 'active') {
      throw Errors.invalidTransition(
        'Only active subscriptions can be paused'
      );
    }
    if (!sub.plan_rules?.pausable) {
      throw Errors.planRule('This plan does not allow pausing');
    }

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'pause',
      from: 'active',
      to: 'paused',
      note: req.body?.note || null,
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'paused',
           paused_at = NOW(),
           history = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(history), id]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /subscriptions/:id/resume (Paused -> Active)
router.post(
  '/:id/resume',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(`SELECT * FROM subscriptions WHERE id = $1`, [
      id,
    ]);
    if (subRes.rowCount === 0) throw Errors.notFound();
    const sub = subRes.rows[0];

    if (sub.status !== 'paused') {
      throw Errors.invalidTransition(
        'Only paused subscriptions can be resumed'
      );
    }

    const today = getTodayIST();
    const oldNext = sub.next_invoice_date || today;
    const newNextInvoiceDate = oldNext > today ? oldNext : today;

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'resume',
      from: 'paused',
      to: 'active',
      note: req.body?.note || null,
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'active',
           paused_at = NULL,
           next_invoice_date = $1,
           history = $2::jsonb,
           updated_at = NOW()
       WHERE id = $3`,
      [newNextInvoiceDate, JSON.stringify(history), id]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /subscriptions/:id/renew (Active or Paused stays, extends expiryDate)
router.post(
  '/:id/renew',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(
      `SELECT s.*, pl.rules AS plan_rules, pl.billing_period
       FROM subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       WHERE s.id = $1`,
      [id]
    );
    if (subRes.rowCount === 0) throw Errors.notFound();
    const sub = subRes.rows[0];

    if (!['active', 'paused'].includes(sub.status)) {
      throw Errors.invalidTransition(
        'Only active or paused subscriptions can be renewed'
      );
    }
    if (!sub.plan_rules?.renewable) {
      throw Errors.planRule('This plan does not allow renewal');
    }

    let newExpiryDate;
    if (req.body?.newExpiryDate) {
      if (
        !isValidDateStr(req.body.newExpiryDate) ||
        req.body.newExpiryDate <= sub.expiry_date
      ) {
        throw Errors.validation('Some fields are invalid', [
          {
            field: 'newExpiryDate',
            message: 'newExpiryDate must be YYYY-MM-DD and after current expiryDate',
          },
        ]);
      }
      newExpiryDate = req.body.newExpiryDate;
    } else {
      // Extend by one more term of the same length (default 1 year or plan period)
      const nextTermStart = addDaysStr(sub.expiry_date, 1);
      newExpiryDate = addDaysStr(
        addBillingPeriod(nextTermStart, 'yearly', 1),
        -1
      );
    }

    const today = getTodayIST();
    const isExpired = newExpiryDate < today;

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'renew',
      from: sub.status,
      to: sub.status,
      note: req.body?.note || `Renewed until ${newExpiryDate}`,
    });

    await db.query(
      `UPDATE subscriptions
       SET expiry_date = $1,
           is_expired = $2,
           history = $3::jsonb,
           updated_at = NOW()
       WHERE id = $4`,
      [newExpiryDate, isExpired, JSON.stringify(history), id]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /subscriptions/:id/close (Active or Paused -> Closed)
router.post(
  '/:id/close',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(
      `SELECT s.*, pl.rules AS plan_rules
       FROM subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       WHERE s.id = $1`,
      [id]
    );
    if (subRes.rowCount === 0) throw Errors.notFound();
    const sub = subRes.rows[0];

    if (!['active', 'paused'].includes(sub.status)) {
      throw Errors.invalidTransition(
        'Only active or paused subscriptions can be closed'
      );
    }

    const today = getTodayIST();
    const pastExpiry = sub.expiry_date < today;
    if (!sub.plan_rules?.closable && !pastExpiry) {
      throw Errors.planRule(
        'This plan does not allow closing early before expiryDate'
      );
    }

    const closeReason = pastExpiry ? 'expired' : 'closed_early';
    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'close',
      from: sub.status,
      to: 'closed',
      note: req.body?.note || null,
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'closed',
           close_reason = $1,
           closed_at = NOW(),
           next_invoice_date = NULL,
           history = $2::jsonb,
           updated_at = NOW()
       WHERE id = $3`,
      [closeReason, JSON.stringify(history), id]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /subscriptions/:id/cancel (Draft, Quotation, Confirmed -> Closed)
router.post(
  '/:id/cancel',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const subRes = await db.query(`SELECT * FROM subscriptions WHERE id = $1`, [
      id,
    ]);
    if (subRes.rowCount === 0) throw Errors.notFound();
    const sub = subRes.rows[0];

    if (!['draft', 'quotation', 'confirmed'].includes(sub.status)) {
      throw Errors.invalidTransition(
        'Only draft, quotation or confirmed subscriptions can be cancelled'
      );
    }

    const history = Array.isArray(sub.history) ? [...sub.history] : [];
    history.unshift({
      at: toIsoString(new Date()),
      by: req.user.id,
      action: 'cancel',
      from: sub.status,
      to: 'closed',
      note: req.body?.note || null,
    });

    await db.query(
      `UPDATE subscriptions
       SET status = 'closed',
           close_reason = 'cancelled',
           closed_at = NOW(),
           next_invoice_date = NULL,
           history = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(history), id]
    );

    const detail = await getSubscriptionDetail(id, req.user.role);
    return res.status(200).json({ data: detail });
  })
);

// POST /subscriptions/:id/invoices ("Create invoice now")
router.post(
  '/:id/invoices',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invId = await billOneSubscriptionPeriod(
      id,
      getTodayIST(),
      req.user.id
    );
    const invDetail = await getInvoiceDetail(invId, req.user.role);
    return res.status(201).json({ data: invDetail });
  })
);

module.exports = router;



