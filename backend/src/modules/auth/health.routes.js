const express = require('express');
const db = require('../../database/db.js');
const config = require('../../config/index.js');
const { authenticate } = require('../../middleware/auth.js');
const { toIsoString } = require('../../utils/dates.js');

const router = express.Router();

router.get('/health', async (_req, res) => {
  const ok = await db.checkHealth();
  const time = toIsoString(new Date());
  if (!ok) {
    return res.status(503).json({
      status: 'error',
      db: 'unreachable',
      time,
    });
  }
  return res.status(200).json({
    status: 'ok',
    db: 'ok',
    time,
  });
});

router.get('/meta', authenticate, (_req, res) => {
  return res.status(200).json({
    data: {
      accessLevels: [
        { value: 'staff', label: 'Internal Staff' },
        { value: 'finance', label: 'Finance Lead' },
        { value: 'admin', label: 'Admin' },
      ],
      billingPeriods: ['daily', 'weekly', 'monthly', 'yearly'],
      productTypes: ['service', 'addon', 'physical'],
      paymentMethods: [
        'bank_transfer',
        'card',
        'cash',
        'cheque',
        'upi',
        'other',
      ],
      paymentTermDays: [0, 15, 30, 45],
      subscriptionStatuses: [
        'draft',
        'quotation',
        'confirmed',
        'active',
        'paused',
        'closed',
      ],
      invoiceStatuses: ['draft', 'confirmed', 'paid', 'cancelled'],
      currency: 'INR',
      company: config.company,
    },
  });
});

module.exports = router;



