const express = require('express');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { getTodayIST, isValidDateStr, toIsoString } = require('../../utils/dates.js');
const { executeBillingRun } = require('../../services/billing.service.js');

const router = express.Router();

router.use(authenticate);

// POST /billing/run
router.post(
  '/run',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const dryRun = Boolean(body.dryRun);

    // Finance can only run preview (dryRun: true)
    if (req.user.role === 'finance' && !dryRun) {
      throw Errors.forbidden(
        'Finance users can only preview billing runs (dryRun: true)'
      );
    }

    const asOfDate = body.asOfDate || getTodayIST();
    if (!isValidDateStr(asOfDate)) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'asOfDate', message: 'asOfDate must be YYYY-MM-DD' },
      ]);
    }

    const result = await executeBillingRun({ asOfDate, dryRun });
    return res.status(200).json({ data: result });
  })
);

// GET /billing/last-run
router.get(
  '/last-run',
  requireRole('admin', 'staff', 'finance'),
  asyncHandler(async (_req, res) => {
    const runRes = await db.query(
      `SELECT * FROM billing_runs ORDER BY finished_at DESC LIMIT 1`
    );
    if (runRes.rowCount === 0) {
      return res.status(200).json({ data: null });
    }
    const r = runRes.rows[0];
    return res.status(200).json({
      data: {
        id: r.id,
        asOfDate: r.as_of_date,
        dryRun: Boolean(r.dry_run),
        lifecycle: r.lifecycle,
        dueSubscriptions: Number(r.due_subscriptions),
        created: Number(r.created),
        skippedAlreadyInvoiced: Number(r.skipped_already_invoiced),
        failed: r.failed || [],
        invoiceIds: r.invoice_ids || [],
        startedAt: toIsoString(r.started_at),
        finishedAt: toIsoString(r.finished_at),
      },
    });
  })
);

module.exports = router;



