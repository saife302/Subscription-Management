const cron = require('node-cron');
const config = require('../config/index.js');
const { executeBillingRun } = require('../services/billing.service.js');
const { getTodayIST } = require('../utils/dates.js');

function startNightlyBillingJob() {
  if (!config.runJobs) return null;

  const task = cron.schedule(
    config.billingCron,
    async () => {
      console.log('[Job:Billing] Starting nightly billing run...');
      try {
        const res = await executeBillingRun({
          asOfDate: getTodayIST(),
          dryRun: false,
        });
        console.log('[Job:Billing] Completed nightly billing run:', res);
      } catch (err) {
        console.error('[Job:Billing] Nightly billing run failed:', err);
      }
    },
    { timezone: config.tz }
  );

  console.log(
    `[Job:Billing] Nightly billing job scheduled (${config.billingCron}, TZ=${config.tz})`
  );
  return task;
}

module.exports = { startNightlyBillingJob };


