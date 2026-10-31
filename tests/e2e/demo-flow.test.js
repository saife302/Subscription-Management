// E2E Demo Script Test (Section 16 - 10-step Demo Flow)
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require(path.resolve(__dirname, '../../backend/node_modules/supertest'));

process.env.NODE_ENV = 'test';
process.env.USE_PGLITE = 'true';
process.env.EMAIL_PROVIDER = 'console';
process.env.DISABLE_RATE_LIMIT = 'true';

const app = require('../../backend/src/app.js');
const db = require('../../backend/src/database/db.js');
const { seedDatabase, IDS } = require('../../backend/src/database/seed/index.js');
const { getTodayIST } = require('../../backend/src/utils/dates.js');

describe('Brightloop E2E Demo Flow', () => {
  before(async () => {
    await seedDatabase({ isLarge: false });
  });

  after(async () => {
    await db.closeDb();
  });

  it('Completes the full 10-step demo flow end-to-end', async () => {
    const staffLogin = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'riya@brightloop.test', password: 'Staff@2026!' });
    const staffTok = staffLogin.body.data.token;

    const custLogin = await request(app)
      .post('/api/v1/auth/customer/login')
      .send({ email: 'billing@acme.test', password: 'Customer@2026!' });
    const custTok = custLogin.body.data.token;

    const finLogin = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'meera@brightloop.test', password: 'Finance@2026!' });
    const finTok = finLogin.body.data.token;

    // Staff creates quotation from template for 25 seats and sends it
    const today = getTodayIST();
    const subRes = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${staffTok}`)
      .send({
        customerId: IDS.acmeCustomer,
        templateId: IDS.tplProYearly,
        startDate: today,
        lines: [
          { productId: IDS.prodCrm, variantId: IDS.varOdoo, quantity: 25 },
          { productId: IDS.prodAnalytics, variantId: null, quantity: 1 },
        ],
      });
    assert.equal(subRes.status, 201);
    const subId = subRes.body.data.id;

    const sendRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/send`)
      .set('Authorization', `Bearer ${staffTok}`);
    assert.equal(sendRes.body.data.status, 'quotation');

    // Customer accepts quotation in portal -> goes Active immediately since startDate == today
    const accRes = await request(app)
      .post(`/api/v1/portal/subscriptions/${subId}/accept`)
      .set('Authorization', `Bearer ${custTok}`);
    assert.equal(accRes.status, 200);
    assert.equal(accRes.body.data.status, 'active');

    // Staff runs billing
    const billRes = await request(app)
      .post('/api/v1/billing/run')
      .set('Authorization', `Bearer ${staffTok}`)
      .send({ asOfDate: today, dryRun: false });
    assert.equal(billRes.status, 200);
    assert.ok(billRes.body.data.created >= 1);
    const invId = billRes.body.data.invoiceIds[0];

    // Staff confirms invoice
    const confInv = await request(app)
      .post(`/api/v1/invoices/${invId}/confirm`)
      .set('Authorization', `Bearer ${staffTok}`);
    assert.equal(confInv.body.data.status, 'confirmed');
    assert.equal(confInv.body.data.total, 12814800);

    // Finance records part payment then rest
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${finTok}`)
      .send({
        invoiceId: invId,
        method: 'bank_transfer',
        amount: 5000000,
        paymentDate: today,
      });
    const finalPay = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${finTok}`)
      .send({
        invoiceId: invId,
        method: 'bank_transfer',
        amount: 7814800,
        paymentDate: today,
      });
    assert.equal(finalPay.body.data.invoice.status, 'paid');
    assert.equal(finalPay.body.data.invoice.balance, 0);
  });
});

