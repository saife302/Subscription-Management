const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const config = {
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  },
  get port() {
    return parseInt(process.env.PORT || '4000', 10);
  },
  get databaseUrl() {
    return (
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/brightloop'
    );
  },
  get redisUrl() {
    return process.env.REDIS_URL || 'redis://localhost:6379';
  },
  get jwtSecret() {
    return (
      process.env.JWT_SECRET ||
      'brightloop-local-dev-secret-key-min-32-chars-2026'
    );
  },
  get jwtExpiresIn() {
    return process.env.JWT_EXPIRES_IN || '7d';
  },
  get corsOrigins() {
    const raw = process.env.CORS_ORIGINS || 'http://localhost:5173';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get webUrl() {
    return (process.env.WEB_URL || 'http://localhost:5173').replace(/\/+$/, '');
  },
  get emailProvider() {
    return process.env.EMAIL_PROVIDER || 'console';
  },
  get brevoApiKey() {
    return process.env.BREVO_API_KEY || '';
  },
  get brevoSenderEmail() {
    return process.env.BREVO_SENDER_EMAIL || 'noreply@brightloop.test';
  },
  get brevoSenderName() {
    return process.env.BREVO_SENDER_NAME || 'SubNex';
  },
  get brevoSmtpLogin() {
    return process.env.BREVO_SMTP_LOGIN || process.env.BREVO_SMTP_USER || '';
  },
  get razorpayKeyId() {
    return process.env.RAZORPAY_KEY_ID || '';
  },
  get razorpayKeySecret() {
    return process.env.RAZORPAY_KEY_SECRET || '';
  },
  get brevoTemplateResetId() {
    const val = process.env.BREVO_TEMPLATE_RESET_ID;
    return val ? parseInt(val, 10) : null;
  },
  get tz() {
    return process.env.TZ || 'Asia/Kolkata';
  },
  get runJobs() {
    return process.env.RUN_JOBS === 'true';
  },
  get billingCron() {
    return process.env.BILLING_CRON || '30 0 * * *';
  },
  get customerSelfService() {
    return process.env.CUSTOMER_SELF_SERVICE === 'true';
  },
  get company() {
    return {
      name: process.env.COMPANY_NAME || 'Brightloop Software',
      address:
        process.env.COMPANY_ADDRESS ||
        '100 Residency Road, Bengaluru, Karnataka 560025, IN',
      taxId: process.env.COMPANY_TAX_ID || '29AABCB1234F1Z5',
      email: process.env.COMPANY_EMAIL || 'billing@brightloop.test',
    };
  },
};

module.exports = config;


