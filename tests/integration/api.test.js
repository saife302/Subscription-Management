const path = require('path');
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require(path.resolve(__dirname, '../../backend/node_modules/supertest'));

process.env.NODE_ENV = 'test';
process.env.USE_PGLITE = 'true';
process.env.EMAIL_PROVIDER = 'console';
process.env.DISABLE_RATE_LIMIT = 'true';

const app = require('../../backend/src/app.js');
const db = require('../../backend/src/database/db.js');
const { seedDatabase, IDS } = require('../../backend/src/database/seed/index.js');
const { resetRateLimits } = require('../../backend/src/middleware/rateLimit.js');
const { sentEmailsLog } = require('../../backend/src/services/mailer.service.js');
const { getTodayIST, addDaysStr } = require('../../backend/src/utils/dates.js');

describe('Brightloop API Specification - Must-Pass Checks (Section 16)', () => {
  let adminToken;
  let staffToken;
  let financeToken;
  let acmeCustomerToken;
  let kiteCustomerToken;

  before(async () => {
    await seedDatabase({ isLarge: false });

    const [adminRes, staffRes, finRes, acmeRes, kiteRes] = await Promise.all([
      request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'admin@brightloop.test', password: 'Admin@2026!' }),
      request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'riya@brightloop.test', password: 'Staff@2026!' }),
      request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'meera@brightloop.test', password: 'Finance@2026!' }),
      request(app)
        .post('/api/v1/auth/customer/login')
        .send({ email: 'billing@acme.test', password: 'Customer@2026!' }),
      request(app)
        .post('/api/v1/auth/customer/login')
        .send({ email: 'asha@kite.test', password: 'Customer@2026!' }),
    ]);

    adminToken = adminRes.body.data.token;
    staffToken = staffRes.body.data.token;
    financeToken = finRes.body.data.token;
    acmeCustomerToken = acmeRes.body.data.token;
    kiteCustomerToken = kiteRes.body.data.token;
  });

  after(async () => {
    await db.closeDb();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  it('1. Health check and /meta work properly', async () => {
    const hRes = await request(app).get('/api/v1/health');
    assert.equal(hRes.status, 200);
    assert.equal(hRes.body.status, 'ok');
    assert.equal(hRes.body.db, 'ok');

    const mRes = await request(app)
      .get('/api/v1/meta')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(mRes.status, 200);
    assert.equal(mRes.body.data.currency, 'INR');
    assert.equal(mRes.body.data.accessLevels.length, 3);
  });

  it('2. Sign-up with an existing email in different case (ASHA@kite.test) returns 409 EMAIL_TAKEN', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customer/signup')
      .send({
        name: 'Asha Duplicate',
        companyName: 'Kite Stores',
        email: 'ASHA@kite.test',
        password: 'Kite@2026!',
      });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });

  it('3. Sign-up with "role": "admin" in the body still creates a customer', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customer/signup')
      .send({
        name: 'Sneaky User',
        companyName: 'Sneaky Corp',
        email: 'sneaky@customer.test',
        password: 'Kite@2026!',
        role: 'admin',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'customer');
  });

  it('4. A staff account on /auth/customer/login, and a customer account on /auth/staff/login, both get 401 INVALID_CREDENTIALS', async () => {
    const res1 = await request(app)
      .post('/api/v1/auth/customer/login')
      .send({ email: 'riya@brightloop.test', password: 'Staff@2026!' });
    assert.equal(res1.status, 401);
    assert.equal(res1.body.error.code, 'INVALID_CREDENTIALS');

    const res2 = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'asha@kite.test', password: 'Customer@2026!' });
    assert.equal(res2.status, 401);
    assert.equal(res2.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('5. Password Short1!A (8 characters) is rejected; Kite@2026! is accepted', async () => {
    const badRes = await request(app)
      .post('/api/v1/auth/customer/signup')
      .send({
        name: 'Short Pwd',
        email: 'short@test.com',
        password: 'Short1!A',
      });
    assert.equal(badRes.status, 400);
    assert.equal(badRes.body.error.code, 'VALIDATION_ERROR');
    assert.ok(badRes.body.error.details.length >= 1);

    const goodRes = await request(app)
      .post('/api/v1/auth/customer/signup')
      .send({
        name: 'Good Pwd',
        email: 'good@test.com',
        password: 'Kite@2026!',
      });
    assert.equal(goodRes.status, 201);
  });

  it('6. A user with a temporary password gets 403 PASSWORD_CHANGE_REQUIRED on everything except /auth/me and /auth/change-password, and after password change old token gets 401', async () => {
    const uRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Temp Staff',
        email: 'tempstaff@brightloop.test',
        role: 'staff',
        temporaryPassword: 'Welcome@2026!',
      });
    assert.equal(uRes.status, 201);
    assert.equal(uRes.body.data.mustChangePassword, true);

    const loginRes = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'tempstaff@brightloop.test', password: 'Welcome@2026!' });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.data.user.mustChangePassword, true);
    const oldToken = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    assert.equal(meRes.status, 200);

    const prodRes = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${oldToken}`);
    assert.equal(prodRes.status, 403);
    assert.equal(prodRes.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

    const chgRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({
        currentPassword: 'Welcome@2026!',
        newPassword: 'Updated@2026!',
      });
    assert.equal(chgRes.status, 200);
    assert.equal(chgRes.body.data.user.mustChangePassword, false);
    const newToken = chgRes.body.data.token;

    const oldCheck = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    assert.equal(oldCheck.status, 401);
    assert.equal(oldCheck.body.error.code, 'UNAUTHENTICATED');

    const newCheck = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${newToken}`);
    assert.equal(newCheck.status, 200);
  });

  it('7. Staff forgot password sends an email whose link opens /staff/reset-password; works once, and unknown email returns 200 and sends nothing', async () => {
    const beforeCount = sentEmailsLog.length;

    const unkRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@nowhere.test', portal: 'staff' });
    assert.equal(unkRes.status, 200);
    assert.equal(sentEmailsLog.length, beforeCount);

    const fpRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'meera@brightloop.test', portal: 'staff' });
    assert.equal(fpRes.status, 200);
    assert.equal(sentEmailsLog.length, beforeCount + 1);

    const lastMail = sentEmailsLog[sentEmailsLog.length - 1];
    assert.ok(lastMail.params.resetUrl.includes('/staff/reset-password?token='));
    const rawToken = lastMail.params.resetUrl.split('token=')[1];

    const rstRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, newPassword: 'Finance@2026!' });
    assert.equal(rstRes.status, 200);
    financeToken = rstRes.body.data.token;

    const reuseRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, newPassword: 'Finance@2026!' });
    assert.equal(reuseRes.status, 400);
    assert.equal(reuseRes.body.error.code, 'TOKEN_INVALID');
  });

  it('8. CSV import: bad row preview & all-or-nothing rejection, duplicate detection, and valid 200-row import', async () => {
    const badCsv = [
      'name,email,temporary_password,access_level',
      'Valid One,valid1@brightloop.test,Welcome@2026!,Internal Staff',
      'Dup One,VALID1@brightloop.test,Welcome@2026!,Finance Lead',
      'Bad Role,badrole@brightloop,Welcome@2026!,Customer',
    ].join('\n');

    const prevRes = await request(app)
      .post('/api/v1/users/import?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(badCsv, 'utf8'), 'users.csv');
    assert.equal(prevRes.status, 200);
    assert.equal(prevRes.body.data.total, 3);
    assert.equal(prevRes.body.data.valid, 1);
    assert.equal(prevRes.body.data.invalid, 2);
    assert.equal(prevRes.body.data.created, 0);

    const realBadRes = await request(app)
      .post('/api/v1/users/import?dryRun=false')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(badCsv, 'utf8'), 'users.csv');
    assert.equal(realBadRes.status, 200);
    assert.equal(realBadRes.body.data.created, 0);

    const rows200 = ['name,email,temporary_password,access_level'];
    for (let i = 1; i <= 200; i++) {
      rows200.push(
        `Bulk User ${i},bulkuser${i}@brightloop.test,Welcome@2026!,Internal Staff`
      );
    }
    const startMs = Date.now();
    const ok200Res = await request(app)
      .post('/api/v1/users/import?dryRun=false')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(rows200.join('\n'), 'utf8'), 'bulk200.csv');
    const elapsedMs = Date.now() - startMs;
    assert.equal(ok200Res.status, 201);
    assert.equal(ok200Res.body.data.created, 200);
    assert.ok(elapsedMs < 60000, `200-row import took ${elapsedMs}ms`);
  });

  it('9. Role permissions: Staff calling POST /discounts gets 403; finance calling POST /subscriptions gets 403', async () => {
    const staffDisc = await request(app)
      .post('/api/v1/discounts')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Unauthorized Discount',
        type: 'percentage',
        value: 10,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        appliesTo: { kind: 'subscription' },
      });
    assert.equal(staffDisc.status, 403);
    assert.equal(staffDisc.body.error.code, 'FORBIDDEN');

    const finSub = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        customerId: IDS.acmeCustomer,
        planId: IDS.planBasicMonthly,
        startDate: '2026-10-01',
      });
    assert.equal(finSub.status, 403);
    assert.equal(finSub.body.error.code, 'FORBIDDEN');
  });

  it('10. Customer A requesting Customer B invoice gets 404, and customer never sees draft invoice or draft subscription', async () => {
    const crossRes = await request(app)
      .get('/api/v1/portal/invoices/6721f0c2a1b2c3d4e5f607a0')
      .set('Authorization', `Bearer ${kiteCustomerToken}`);
    assert.equal(crossRes.status, 404);
    assert.equal(crossRes.body.error.code, 'NOT_FOUND');

    const draftSubRes = await request(app)
      .get('/api/v1/portal/subscriptions/6721f0c2a1b2c3d4e5f60764')
      .set('Authorization', `Bearer ${kiteCustomerToken}`);
    assert.equal(draftSubRes.status, 404);

    const listSubs = await request(app)
      .get('/api/v1/portal/subscriptions')
      .set('Authorization', `Bearer ${kiteCustomerToken}`);
    assert.equal(listSubs.status, 200);
    assert.ok(listSubs.body.data.every((s) => s.status !== 'draft'));
  });

  it('11. Pricing engine: Test case 1 total = 12814800 paise; Test case 2 total = 295000 paise', async () => {
    const tc1Res = await request(app)
      .get(`/api/v1/subscriptions/${IDS.subTestCase1}`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(tc1Res.status, 200);
    assert.equal(tc1Res.body.data.totals.total, 12814800);

    const tc2Res = await request(app)
      .get(`/api/v1/subscriptions/${IDS.subTestCase2}`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(tc2Res.status, 200);
    assert.equal(tc2Res.body.data.totals.total, 295000);
  });

  it('12. Billing run: catch-up 3 periods behind, idempotency on second run, concurrent runs create no duplicates, cancelling latest invoice rebills on next run, and usageLimit: 1 lands on exactly one invoice', async () => {
    const today = getTodayIST();
    const start3MonthsAgo = addDaysStr(today, -70);

    const createSubRes = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId: IDS.acmeCustomer,
        planId: IDS.planBasicMonthly,
        startDate: start3MonthsAgo,
        expiryDate: addDaysStr(today, 300),
      });
    assert.equal(createSubRes.status, 201);
    const subId = createSubRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/send`)
      .set('Authorization', `Bearer ${staffToken}`);
    const confRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/confirm`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(confRes.body.data.status, 'active');

    const disc1Res = await request(app)
      .post('/api/v1/discounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'One-Time Mega â‚¹800 Off',
        type: 'fixed',
        value: 80000,
        minPurchaseAmount: 100000,
        startDate: addDaysStr(today, -100),
        endDate: addDaysStr(today, 100),
        usageLimit: 1,
        appliesTo: { kind: 'subscription', productIds: [] },
      });
    assert.equal(disc1Res.status, 201);
    const singleUseDiscountId = disc1Res.body.data.id;

    const [run1, run2] = await Promise.all([
      request(app)
        .post('/api/v1/billing/run')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ asOfDate: today, dryRun: false }),
      request(app)
        .post('/api/v1/billing/run')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ asOfDate: today, dryRun: false }),
    ]);
    assert.equal(run1.status, 200);
    assert.equal(run2.status, 200);

    const subInvsRes = await request(app)
      .get(`/api/v1/invoices?subscriptionId=${subId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(subInvsRes.status, 200);
    assert.equal(subInvsRes.body.data.length, 3);

    const discCheck = await request(app)
      .get(`/api/v1/discounts/${singleUseDiscountId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(discCheck.body.data.usedCount, 1);
    assert.equal(discCheck.body.data.state, 'exhausted');

    const runAgain = await request(app)
      .post('/api/v1/billing/run')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ asOfDate: today, dryRun: false });
    assert.equal(runAgain.status, 200);
    assert.equal(runAgain.body.data.created, 0);

    const latestInvId = subInvsRes.body.data[0].id;
    const cancelRes = await request(app)
      .post(`/api/v1/invoices/${latestInvId}/cancel`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ rebill: true });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.data.status, 'cancelled');
    assert.equal(cancelRes.body.data.isVoid, true);

    const runAfterCancel = await request(app)
      .post('/api/v1/billing/run')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ asOfDate: today, dryRun: false });
    assert.equal(runAfterCancel.status, 200);
    assert.equal(runAfterCancel.body.data.created, 1);
  });

  it('13. Payments: overpayment returns 409 OVERPAYMENT; exact balance marks invoice Paid; admin DELETE reverses payment', async () => {
    const invId = '6721f0c2a1b2c3d4e5f607a1';

    const overRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        invoiceId: invId,
        method: 'upi',
        amount: 300000,
        paymentDate: getTodayIST(),
      });
    assert.equal(overRes.status, 409);
    assert.equal(overRes.body.error.code, 'OVERPAYMENT');

    const exactRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        invoiceId: invId,
        method: 'upi',
        amount: 295000,
        paymentDate: getTodayIST(),
      });
    assert.equal(exactRes.status, 201);
    assert.equal(exactRes.body.data.invoice.status, 'paid');
    assert.equal(exactRes.body.data.invoice.balance, 0);

    const payId = exactRes.body.data.payment.id;

    const revRes = await request(app)
      .delete(`/api/v1/payments/${payId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Entered on wrong invoice' });
    assert.equal(revRes.status, 204);

    const invCheck = await request(app)
      .get(`/api/v1/invoices/${invId}`)
      .set('Authorization', `Bearer ${financeToken}`);
    assert.equal(invCheck.body.data.status, 'confirmed');
    assert.equal(invCheck.body.data.balance, 295000);
  });

  it('14. Reports respond fast and accurately', async () => {
    const t0 = Date.now();
    const [sumRes, revRes, planRes, ageRes, expRes] = await Promise.all([
      request(app)
        .get('/api/v1/reports/summary')
        .set('Authorization', `Bearer ${financeToken}`),
      request(app)
        .get('/api/v1/reports/revenue-by-month')
        .set('Authorization', `Bearer ${financeToken}`),
      request(app)
        .get('/api/v1/reports/subscriptions-by-plan')
        .set('Authorization', `Bearer ${financeToken}`),
      request(app)
        .get('/api/v1/reports/aging')
        .set('Authorization', `Bearer ${financeToken}`),
      request(app)
        .get('/api/v1/reports/export?type=invoices')
        .set('Authorization', `Bearer ${financeToken}`),
    ]);
    const elapsed = Date.now() - t0;

    assert.equal(sumRes.status, 200);
    assert.equal(revRes.status, 200);
    assert.equal(planRes.status, 200);
    assert.equal(ageRes.status, 200);
    assert.equal(expRes.status, 200);
    assert.ok(expRes.headers['content-type'].includes('text/csv'));
    assert.ok(elapsed < 2000, `Reports took ${elapsed}ms (must be < 2000ms)`);
  });
});

