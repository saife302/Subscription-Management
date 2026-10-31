const app = require('./app.js');
const config = require('./config/index.js');
const db = require('./database/db.js');
const { startNightlyBillingJob } = require('./jobs/billing.job.js');

async function startServer() {
  try {
    await db.initDb();
    console.log('[DB] PostgreSQL schema initialized successfully.');

    startNightlyBillingJob();

    const port = config.port;
    app.listen(port, () => {
      console.log(
        `[Server] Brightloop API listening on http://localhost:${port}/api/v1`
      );
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };


