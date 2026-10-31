const bcrypt = require('bcrypt');
const db = require('../db.js');
const { generateId } = require('../../utils/ids.js');
const { getTodayIST, addDaysStr, toIsoString } = require('../../utils/dates.js');
const { priceLines } = require('../../utils/pricing.js');

const IDS = {
  adminUser: '6721f0c2a1b2c3d4e5f60700',
  staffUser: '6721f0c2a1b2c3d4e5f60740',
  financeUser: '6721f0c2a1b2c3d4e5f60745',
  acmeUser: '6721f0c2a1b2c3d4e5f60703',
  kiteUser: '6721f0c2a1b2c3d4e5f60701',
  acmeCustomer: '6721f0c2a1b2c3d4e5f60750',
  kiteCustomer: '6721f0c2a1b2c3d4e5f60702',
  prodCrm: '6721f0c2a1b2c3d4e5f60710',
  varOdoo: '6721f0c2a1b2c3d4e5f60711',
  varGeneric: '6721f0c2a1b2c3d4e5f60712',
  prodAnalytics: '6721f0c2a1b2c3d4e5f60730',
  prodStorage: '6721f0c2a1b2c3d4e5f60731',
  prodOnboarding: '6721f0c2a1b2c3d4e5f60732',
  planProYearly: '6721f0c2a1b2c3d4e5f60720',
  planBasicMonthly: '6721f0c2a1b2c3d4e5f60721',
  planTeamWeekly: '6721f0c2a1b2c3d4e5f60722',
  planSandboxDaily: '6721f0c2a1b2c3d4e5f60723',
  tplProYearly: '6721f0c2a1b2c3d4e5f60770',
  tplBasicMonthly: '6721f0c2a1b2c3d4e5f60771',
  taxGst18: '6721f0c2a1b2c3d4e5f60790',
  taxGst12: '6721f0c2a1b2c3d4e5f60791',
  discBulk10: '6721f0c2a1b2c3d4e5f60780',
  discLaunch500: '6721f0c2a1b2c3d4e5f60781',
  discExpired: '6721f0c2a1b2c3d4e5f60782',
  discExhausted: '6721f0c2a1b2c3d4e5f60783',
  discScheduled: '6721f0c2a1b2c3d4e5f60784',
  subTestCase1: '6721f0c2a1b2c3d4e5f60760',
  subTestCase2: '6721f0c2a1b2c3d4e5f60765',
};

async function seedDatabase({ isLarge = false } = {}) {
  await db.initDb();
  const today = getTodayIST();
  const year = today.slice(0, 4);

  await db.query(
    `TRUNCATE payments, invoices, subscriptions, quotation_templates, discounts, taxes, plans, products, customers, users, counters, billing_runs RESTART IDENTITY CASCADE`
  );

  // 1. Seed Users
  const [adminHash, staffHash, financeHash, customerHash] = await Promise.all([
    bcrypt.hash('Admin@2026!', 10),
    bcrypt.hash('Staff@2026!', 10),
    bcrypt.hash('Finance@2026!', 10),
    bcrypt.hash('Customer@2026!', 10),
  ]);

  await db.query(
    `INSERT INTO users (id, name, email, password_hash, role, status, must_change_password, created_via, customer_id)
     VALUES
       ($1, 'Arjun Mehta', 'admin@brightloop.test', $6, 'admin', 'active', FALSE, 'seed', NULL),
       ($2, 'Riya Sharma', 'riya@brightloop.test', $7, 'staff', 'active', FALSE, 'seed', NULL),
       ($3, 'Meera Nair', 'meera@brightloop.test', $8, 'finance', 'active', FALSE, 'seed', NULL),
       ($4, 'Vikram Iyer', 'billing@acme.test', $9, 'customer', 'active', FALSE, 'seed', $10),
       ($5, 'Asha Rao', 'asha@kite.test', $9, 'customer', 'active', FALSE, 'seed', $11)`,
    [
      IDS.adminUser,
      IDS.staffUser,
      IDS.financeUser,
      IDS.acmeUser,
      IDS.kiteUser,
      adminHash,
      staffHash,
      financeHash,
      customerHash,
      IDS.acmeCustomer,
      IDS.kiteCustomer,
    ]
  );

  // 2. Seed Customers (50 total; Acme and Kite linked to logins)
  await db.query(
    `INSERT INTO customers (id, name, contact_name, email, phone, billing_address, tax_id, notes, user_id, is_active)
     VALUES
       ($1, 'Acme Ltd', 'Vikram Iyer', 'billing@acme.test', '+91 98450 00000', $3::jsonb, '29ABCDE1234F1Z5', 'Key enterprise customer', $5, TRUE),
       ($2, 'Kite Stores', 'Asha Rao', 'asha@kite.test', '+91 98220 11111', $4::jsonb, '27KITES5678G1Z2', 'Retail chain', $6, TRUE)`,
    [
      IDS.acmeCustomer,
      IDS.kiteCustomer,
      JSON.stringify({
        line1: '12 MG Road',
        line2: '',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'IN',
      }),
      JSON.stringify({
        line1: '45 FC Road',
        line2: '',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411004',
        country: 'IN',
      }),
      IDS.acmeUser,
      IDS.kiteUser,
    ]
  );

  const extraCustomerIds = [];
  for (let i = 3; i <= 50; i++) {
    const cid = generateId();
    extraCustomerIds.push(cid);
    await db.query(
      `INSERT INTO customers (id, name, contact_name, email, phone, billing_address, tax_id, notes, user_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, '', NULL, TRUE)`,
      [
        cid,
        `Customer Co ${i}`,
        `Contact ${i}`,
        `contact${i}@customer${i}.test`,
        `+91 98000 ${String(i).padStart(5, '0')}`,
        JSON.stringify({
          line1: `${i} Park Street`,
          line2: '',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'IN',
        }),
        `27CUSTM${String(i).padStart(4, '0')}F1Z5`,
      ]
    );
  }

  // 3. Seed Products
  const crmVariants = [
    {
      id: IDS.varOdoo,
      attribute: 'Brand',
      value: 'Odoo',
      extraPrice: 56000,
    },
    {
      id: IDS.varGeneric,
      attribute: 'Brand',
      value: 'Generic',
      extraPrice: 0,
    },
  ];

  await db.query(
    `INSERT INTO products (id, name, type, sales_price, cost_price, notes, variants, is_active)
     VALUES
       ($1, 'Brightloop CRM', 'service', 400000, 90000, 'Core CRM seat', $5::jsonb, TRUE),
       ($2, 'Analytics add-on', 'addon', 600000, 100000, 'Advanced BI dashboards', '[]'::jsonb, TRUE),
       ($3, 'Extra storage add-on', 'addon', 150000, 30000, '100 GB cloud storage', '[]'::jsonb, TRUE),
       ($4, 'Onboarding kit', 'physical', 250000, 120000, 'Printed welcome pack & hardware key', '[]'::jsonb, TRUE)`,
    [
      IDS.prodCrm,
      IDS.prodAnalytics,
      IDS.prodStorage,
      IDS.prodOnboarding,
      JSON.stringify(crmVariants),
    ]
  );

  // 4. Seed Plans (daily, weekly, monthly, yearly)
  await db.query(
    `INSERT INTO plans (id, name, product_id, price, billing_period, min_quantity, available_from, available_until, rules, description, is_active)
     VALUES
       ($1, 'Pro Yearly', $5, 400000, 'yearly', 10, '2025-01-01', '2027-12-31', $6::jsonb, 'Yearly contract for teams of 10+', TRUE),
       ($2, 'Basic Monthly', $5, 300000, 'monthly', 1, '2025-01-01', NULL, $7::jsonb, 'Flexible monthly CRM plan', TRUE),
       ($3, 'Team Weekly', $5, 90000, 'weekly', 3, '2025-01-01', NULL, $8::jsonb, 'Weekly sprint subscription', TRUE),
       ($4, 'Sandbox Daily', $5, 20000, 'daily', 1, '2025-01-01', NULL, $9::jsonb, 'Daily test environment', TRUE)`,
    [
      IDS.planProYearly,
      IDS.planBasicMonthly,
      IDS.planTeamWeekly,
      IDS.planSandboxDaily,
      IDS.prodCrm,
      JSON.stringify({
        autoClose: true,
        closable: false,
        pausable: false,
        renewable: true,
      }),
      JSON.stringify({
        autoClose: false,
        closable: true,
        pausable: true,
        renewable: true,
      }),
      JSON.stringify({
        autoClose: false,
        closable: true,
        pausable: true,
        renewable: false,
      }),
      JSON.stringify({
        autoClose: true,
        closable: true,
        pausable: false,
        renewable: false,
      }),
    ]
  );

  // 5. Seed Taxes
  await db.query(
    `INSERT INTO taxes (id, name, type, rate, applies_to, is_active)
     VALUES
       ($1, 'GST 18%', 'percentage', 18, $3::jsonb, TRUE),
       ($2, 'GST 12%', 'percentage', 12, $4::jsonb, TRUE)`,
    [
      IDS.taxGst18,
      IDS.taxGst12,
      JSON.stringify({
        kind: 'productTypes',
        productTypes: ['service', 'addon'],
        productIds: [],
      }),
      JSON.stringify({
        kind: 'productTypes',
        productTypes: ['physical'],
        productIds: [],
      }),
    ]
  );

  // 6. Seed Discounts (Bulk seats 10% running, Launch â‚¹500 off running, plus expired, exhausted, scheduled)
  const startRunning = addDaysStr(today, -60);
  const endRunning = addDaysStr(today, 120);

  await db.query(
    `INSERT INTO discounts (id, name, type, value, min_purchase_amount, min_quantity, start_date, end_date, usage_limit, used_count, applies_to, is_active)
     VALUES
       ($1, 'Bulk seats 10%', 'percentage', 10, NULL, 20, $6, $7, 50, 1, $8::jsonb, TRUE),
       ($2, 'Launch â‚¹500 off', 'fixed', 50000, 200000, NULL, $6, $7, NULL, 1, $9::jsonb, TRUE),
       ($3, 'Summer Promo 15%', 'percentage', 15, NULL, 5, '2025-05-01', '2025-06-30', 100, 12, $9::jsonb, TRUE),
       ($4, 'Early Bird â‚¹1000', 'fixed', 100000, 500000, NULL, $6, $7, 10, 10, $9::jsonb, TRUE),
       ($5, 'New Year 20%', 'percentage', 20, NULL, 10, $10, $11, 100, 0, $8::jsonb, TRUE)`,
    [
      IDS.discBulk10,
      IDS.discLaunch500,
      IDS.discExpired,
      IDS.discExhausted,
      IDS.discScheduled,
      startRunning,
      endRunning,
      JSON.stringify({ kind: 'products', productIds: [IDS.prodCrm] }),
      JSON.stringify({ kind: 'subscription', productIds: [] }),
      addDaysStr(today, 30),
      addDaysStr(today, 90),
    ]
  );

  // 7. Seed Quotation Templates
  await db.query(
    `INSERT INTO quotation_templates (id, name, plan_id, validity_days, payment_term_days, lines, notes, is_active)
     VALUES
       ($1, 'Pro Yearly â€“ Standard', $3, 14, 30, $5::jsonb, 'Prices exclude GST. Billed yearly in advance.', TRUE),
       ($2, 'Basic Monthly â€“ Starter', $4, 7, 15, $6::jsonb, 'Monthly starter package.', TRUE)`,
    [
      IDS.tplProYearly,
      IDS.tplBasicMonthly,
      IDS.planProYearly,
      IDS.planBasicMonthly,
      JSON.stringify([
        { productId: IDS.prodCrm, variantId: IDS.varOdoo, quantity: 10 },
        { productId: IDS.prodAnalytics, variantId: null, quantity: 1 },
      ]),
      JSON.stringify([
        { productId: IDS.prodCrm, variantId: IDS.varGeneric, quantity: 1 },
      ]),
    ]
  );

  // 8. Seed Subscriptions (including Test Case 1 = 12814800 paise & Test Case 2 = 295000 paise)
  const tc1Lines = [
    {
      id: '6721f0c2a1b2c3d4e5f60761',
      productId: IDS.prodCrm,
      productName: 'Brightloop CRM',
      variantId: IDS.varOdoo,
      variantLabel: 'Brand: Odoo',
      quantity: 25,
      unitPrice: 456000,
    },
    {
      id: '6721f0c2a1b2c3d4e5f60762',
      productId: IDS.prodAnalytics,
      productName: 'Analytics add-on',
      variantId: null,
      variantLabel: null,
      quantity: 1,
      unitPrice: 600000,
    },
  ];
  const tc1Priced = await priceLines({ lines: tc1Lines }, today);

  const tc2Lines = [
    {
      id: '6721f0c2a1b2c3d4e5f60766',
      productId: IDS.prodCrm,
      productName: 'Brightloop CRM',
      variantId: IDS.varGeneric,
      variantLabel: 'Brand: Generic',
      quantity: 1,
      unitPrice: 300000,
    },
  ];
  const tc2Priced = await priceLines({ lines: tc2Lines }, today);

  const nowIso = toIsoString(new Date());

  // Insert Test Case 1 (Acme, Active) & Test Case 2 (Kite, Active)
  await db.query(
    `INSERT INTO subscriptions (
       id, number, customer_id, plan_id, template_id, salesperson_id,
       status, start_date, expiry_date, is_expired, quotation_valid_until,
       payment_term_days, lines, next_invoice_date, recurring_total, recurring_net,
       notes, history
     )
     VALUES
       ($1, $3, $5, $7, $9, $10, 'active', '2026-01-01', '2026-12-31', FALSE, NULL, 30, $11::jsonb, '2027-01-01', $12, $13, 'Test Case 1 subscription', $16::jsonb),
       ($2, $4, $6, $8, NULL, $10, 'active', '2026-10-01', '2027-09-30', FALSE, NULL, 15, $14::jsonb, '2026-11-01', $15, $17, 'Test Case 2 subscription', $16::jsonb)`,
    [
      IDS.subTestCase1,
      IDS.subTestCase2,
      `SUB/${year}/0001`,
      `SUB/${year}/0002`,
      IDS.acmeCustomer,
      IDS.kiteCustomer,
      IDS.planProYearly,
      IDS.planBasicMonthly,
      IDS.tplProYearly,
      IDS.staffUser,
      JSON.stringify(tc1Lines),
      tc1Priced.recurringTotal,
      tc1Priced.recurringNet,
      JSON.stringify(tc2Lines),
      tc2Priced.recurringTotal,
      JSON.stringify([
        {
          at: nowIso,
          by: 'system',
          action: 'activate',
          from: 'confirmed',
          to: 'active',
          note: null,
        },
      ]),
      tc2Priced.recurringNet,
    ]
  );

  // Additional subscriptions in every status (draft, quotation expiring tomorrow, confirmed, paused, closed, past expiry without auto-close)
  const extraSubs = [
    {
      id: '6721f0c2a1b2c3d4e5f60763',
      num: `SUB/${year}/0003`,
      cust: IDS.acmeCustomer,
      plan: IDS.planBasicMonthly,
      status: 'quotation',
      start: addDaysStr(today, 5),
      expiry: addDaysStr(today, 369),
      isExp: false,
      validUntil: addDaysStr(today, 1), // expiring tomorrow
      nextInv: null,
    },
    {
      id: '6721f0c2a1b2c3d4e5f60764',
      num: `SUB/${year}/0004`,
      cust: IDS.kiteCustomer,
      plan: IDS.planBasicMonthly,
      status: 'draft',
      start: addDaysStr(today, 10),
      expiry: addDaysStr(today, 374),
      isExp: false,
      validUntil: null,
      nextInv: null,
    },
    {
      id: '6721f0c2a1b2c3d4e5f60767',
      num: `SUB/${year}/0005`,
      cust: extraCustomerIds[0],
      plan: IDS.planBasicMonthly,
      status: 'confirmed',
      start: addDaysStr(today, 7),
      expiry: addDaysStr(today, 371),
      isExp: false,
      validUntil: null,
      nextInv: null,
    },
    {
      id: '6721f0c2a1b2c3d4e5f60768',
      num: `SUB/${year}/0006`,
      cust: extraCustomerIds[1],
      plan: IDS.planBasicMonthly,
      status: 'paused',
      start: addDaysStr(today, -90),
      expiry: addDaysStr(today, 275),
      isExp: false,
      validUntil: null,
      nextInv: addDaysStr(today, 15),
    },
    {
      id: '6721f0c2a1b2c3d4e5f60769',
      num: `SUB/${year}/0007`,
      cust: extraCustomerIds[2],
      plan: IDS.planBasicMonthly,
      status: 'active',
      start: addDaysStr(today, -400),
      expiry: addDaysStr(today, -35), // past expiry without autoClose
      isExp: true,
      validUntil: null,
      nextInv: addDaysStr(today, -34),
    },
    {
      id: '6721f0c2a1b2c3d4e5f6076a',
      num: `SUB/${year}/0008`,
      cust: extraCustomerIds[3],
      plan: IDS.planProYearly,
      status: 'closed',
      start: '2025-01-01',
      expiry: '2025-12-31',
      isExp: false,
      validUntil: null,
      nextInv: null,
      closeReason: 'expired',
    },
  ];

  for (const s of extraSubs) {
    await db.query(
      `INSERT INTO subscriptions (
         id, number, customer_id, plan_id, salesperson_id, status,
         start_date, expiry_date, is_expired, quotation_valid_until,
         payment_term_days, lines, next_invoice_date, recurring_total, recurring_net,
         close_reason, closed_at, notes, history
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 15, $11::jsonb, $12, $13, $14, $15, $16, '', '[]'::jsonb)`,
      [
        s.id,
        s.num,
        s.cust,
        s.plan,
        IDS.staffUser,
        s.status,
        s.start,
        s.expiry,
        s.isExp,
        s.validUntil,
        JSON.stringify(tc2Lines),
        s.nextInv,
        tc2Priced.recurringTotal,
        tc2Priced.recurringNet,
        s.closeReason || null,
        s.status === 'closed' ? new Date() : null,
      ]
    );
  }

  // 9. Seed Invoices & Payments (overdue by 5, 29, 75 days, partly paid, paid, draft, cancelled)
  const sampleInvoices = [
    {
      id: '6721f0c2a1b2c3d4e5f607a0',
      num: `INV/${year}/0001`,
      subId: IDS.subTestCase1,
      custId: IDS.acmeCustomer,
      custName: 'Acme Ltd',
      custEmail: 'billing@acme.test',
      pStart: '2026-01-01',
      pEnd: '2026-12-31',
      invDate: addDaysStr(today, -10),
      dueDate: addDaysStr(today, 20), // current, partly paid
      status: 'confirmed',
      isVoid: false,
      total: 12814800,
      paid: 5000000,
      balance: 7814800,
    },
    {
      id: '6721f0c2a1b2c3d4e5f607a1',
      num: `INV/${year}/0002`,
      subId: IDS.subTestCase2,
      custId: IDS.kiteCustomer,
      custName: 'Kite Stores',
      custEmail: 'asha@kite.test',
      pStart: '2026-09-01',
      pEnd: '2026-09-30',
      invDate: addDaysStr(today, -44),
      dueDate: addDaysStr(today, -29), // overdue by 29 days
      status: 'confirmed',
      isVoid: false,
      total: 295000,
      paid: 0,
      balance: 295000,
    },
    {
      id: '6721f0c2a1b2c3d4e5f607a2',
      num: `INV/${year}/0003`,
      subId: IDS.subTestCase2,
      custId: IDS.kiteCustomer,
      custName: 'Kite Stores',
      custEmail: 'asha@kite.test',
      pStart: '2026-10-01',
      pEnd: '2026-10-31',
      invDate: addDaysStr(today, -20),
      dueDate: addDaysStr(today, -5), // overdue by 5 days
      status: 'confirmed',
      isVoid: false,
      total: 295000,
      paid: 0,
      balance: 295000,
    },
    {
      id: '6721f0c2a1b2c3d4e5f607a3',
      num: `INV/${year}/0004`,
      subId: '6721f0c2a1b2c3d4e5f60768',
      custId: extraCustomerIds[1],
      custName: 'Customer Co 4',
      custEmail: 'contact4@customer4.test',
      pStart: '2026-07-01',
      pEnd: '2026-07-31',
      invDate: addDaysStr(today, -90),
      dueDate: addDaysStr(today, -75), // overdue by 75 days
      status: 'confirmed',
      isVoid: false,
      total: 295000,
      paid: 0,
      balance: 295000,
    },
    {
      id: '6721f0c2a1b2c3d4e5f607a4',
      num: `INV/${year}/0005`,
      subId: IDS.subTestCase2,
      custId: IDS.kiteCustomer,
      custName: 'Kite Stores',
      custEmail: 'asha@kite.test',
      pStart: '2026-08-01',
      pEnd: '2026-08-31',
      invDate: addDaysStr(today, -75),
      dueDate: addDaysStr(today, -60),
      status: 'paid',
      isVoid: false,
      total: 295000,
      paid: 295000,
      balance: 0,
    },
    {
      id: '6721f0c2a1b2c3d4e5f607a5',
      num: `INV/${year}/0006`,
      subId: '6721f0c2a1b2c3d4e5f60769',
      custId: extraCustomerIds[2],
      custName: 'Customer Co 5',
      custEmail: 'contact5@customer5.test',
      pStart: '2026-06-01',
      pEnd: '2026-06-30',
      invDate: today,
      dueDate: addDaysStr(today, 15),
      status: 'draft',
      isVoid: false,
      total: 295000,
      paid: 0,
      balance: 295000,
    },
    {
      id: '6721f0c2a1b2c3d4e5f607a6',
      num: `INV/${year}/0007`,
      subId: '6721f0c2a1b2c3d4e5f60769',
      custId: extraCustomerIds[2],
      custName: 'Customer Co 5',
      custEmail: 'contact5@customer5.test',
      pStart: '2026-05-01',
      pEnd: '2026-05-31',
      invDate: addDaysStr(today, -120),
      dueDate: addDaysStr(today, -105),
      status: 'cancelled',
      isVoid: true,
      total: 295000,
      paid: 0,
      balance: 295000,
    },
  ];

  for (const inv of sampleInvoices) {
    await db.query(
      `INSERT INTO invoices (
         id, number, subscription_id, customer_id, customer_snapshot,
         period_start, period_end, invoice_date, due_date, status, is_void,
         lines, order_discount, untaxed_amount, discount_total, tax_total, total,
         amount_paid, balance, applied_discount_ids, confirmed_at, paid_at
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12::jsonb, NULL, $13, 0, 0, $13, $14, $15, '[]'::jsonb, NOW(), $16)`,
      [
        inv.id,
        inv.num,
        inv.subId,
        inv.custId,
        JSON.stringify({
          name: inv.custName,
          email: inv.custEmail,
          billingAddress: {},
          taxId: '',
        }),
        inv.pStart,
        inv.pEnd,
        inv.invDate,
        inv.dueDate,
        inv.status,
        inv.isVoid,
        JSON.stringify(tc2Priced.lines),
        inv.total,
        inv.paid,
        inv.balance,
        inv.status === 'paid' ? new Date() : null,
      ]
    );
  }

  // Payments for partly-paid and paid invoices
  await db.query(
    `INSERT INTO payments (id, invoice_id, customer_id, subscription_id, method, amount, payment_date, note, recorded_by)
     VALUES
       ('6721f0c2a1b2c3d4e5f607b0', '6721f0c2a1b2c3d4e5f607a0', $1, $3, 'bank_transfer', 5000000, $5, 'Part payment, UTR 88213', $6),
       ('6721f0c2a1b2c3d4e5f607b1', '6721f0c2a1b2c3d4e5f607a4', $2, $4, 'upi', 295000, $5, 'Full payment via UPI', $6)`,
    [
      IDS.acmeCustomer,
      IDS.kiteCustomer,
      IDS.subTestCase1,
      IDS.subTestCase2,
      addDaysStr(today, -3),
      IDS.financeUser,
    ]
  );

  let subSeq = 8;
  let invSeq = 7;

  if (isLarge) {
    console.log(
      '[Seed] Inserting --large dataset (5,000 subscriptions, 60,000 invoices, 40,000 payments)...'
    );
    const allCustIds = [
      IDS.acmeCustomer,
      IDS.kiteCustomer,
      ...extraCustomerIds,
    ];
    const plansList = [
      IDS.planProYearly,
      IDS.planBasicMonthly,
      IDS.planTeamWeekly,
      IDS.planSandboxDaily,
    ];

    // Insert 5,000 subscriptions in batches of 500
    const largeSubIds = [];
    for (let b = 0; b < 10; b++) {
      const values = [];
      const params = [];
      for (let i = 0; i < 500; i++) {
        subSeq += 1;
        const sid = generateId();
        largeSubIds.push(sid);
        const sNum = `SUB/${year}/${String(subSeq).padStart(4, '0')}`;
        const custId = allCustIds[(b * 500 + i) % allCustIds.length];
        const planId = plansList[(b * 500 + i) % plansList.length];
        const baseIdx = params.length;
        params.push(
          sid,
          sNum,
          custId,
          planId,
          'active',
          '2026-01-01',
          '2026-12-31',
          '2026-11-01',
          295000,
          250000
        );
        values.push(
          `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${
            baseIdx + 4
          }, $${baseIdx + 5}, $${baseIdx + 6}, $${
            baseIdx + 7
          }, 15, '[]'::jsonb, $${baseIdx + 8}, $${baseIdx + 9}, $${
            baseIdx + 10
          }, '', '[]'::jsonb)`
        );
      }
      await db.query(
        `INSERT INTO subscriptions (id, number, customer_id, plan_id, status, start_date, expiry_date, payment_term_days, lines, next_invoice_date, recurring_total, recurring_net, notes, history)
         VALUES ${values.join(', ')}`,
        params
      );
    }

    // Insert 60,000 invoices in batches of 1,000
    const largeInvIds = [];
    const months = [
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ];
    for (let b = 0; b < 60; b++) {
      const values = [];
      const params = [];
      for (let i = 0; i < 1000; i++) {
        invSeq += 1;
        const iid = generateId();
        const idx = b * 1000 + i;
        const subIdx = idx % 5000;
        const mIdx = Math.floor(idx / 5000) % 12;
        const pStart = `2025-${String((mIdx % 12) + 1).padStart(2, '0')}-${String(
          (Math.floor(idx / 60000) % 20) + 1
        ).padStart(2, '0')}`;
        const invMonth = months[idx % months.length];
        const invDate = `${invMonth}-10`;
        const dueDate = `${invMonth}-25`;
        const isPaid = idx < 40000;
        const status = isPaid ? 'paid' : 'confirmed';
        const paidAmt = isPaid ? 295000 : 0;
        const balAmt = isPaid ? 0 : 295000;
        const custId = allCustIds[subIdx % allCustIds.length];

        if (isPaid) {
          largeInvIds.push({
            id: iid,
            custId,
            subId: largeSubIds[subIdx],
            payDate: invDate,
          });
        }

        const baseIdx = params.length;
        params.push(
          iid,
          `INV/${year}/${String(invSeq).padStart(5, '0')}`,
          largeSubIds[subIdx],
          custId,
          `${pStart}-${idx}`,
          invDate,
          dueDate,
          status,
          295000,
          paidAmt,
          balAmt
        );
        values.push(
          `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${
            baseIdx + 4
          }, '{}'::jsonb, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 6}, $${
            baseIdx + 7
          }, $${baseIdx + 8}, FALSE, '[]'::jsonb, $${baseIdx + 9}, 0, 0, $${
            baseIdx + 9
          }, $${baseIdx + 10}, $${baseIdx + 11}, '[]'::jsonb)`
        );
      }
      await db.query(
        `INSERT INTO invoices (id, number, subscription_id, customer_id, customer_snapshot, period_start, period_end, invoice_date, due_date, status, is_void, lines, untaxed_amount, discount_total, tax_total, total, amount_paid, balance, applied_discount_ids)
         VALUES ${values.join(', ')}`,
        params
      );
    }

    // Insert 40,000 payments in batches of 1,000
    for (let b = 0; b < 40; b++) {
      const values = [];
      const params = [];
      for (let i = 0; i < 1000; i++) {
        const item = largeInvIds[b * 1000 + i];
        const baseIdx = params.length;
        params.push(
          generateId(),
          item.id,
          item.custId,
          item.subId,
          'bank_transfer',
          295000,
          item.payDate,
          IDS.financeUser
        );
        values.push(
          `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${
            baseIdx + 4
          }, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, '', $${
            baseIdx + 8
          })`
        );
      }
      await db.query(
        `INSERT INTO payments (id, invoice_id, customer_id, subscription_id, method, amount, payment_date, note, recorded_by)
         VALUES ${values.join(', ')}`,
        params
      );
    }
  }

  // Update counters
  await db.query(
    `INSERT INTO counters (id, seq) VALUES ($1, $2), ($3, $4)`,
    [`SUB-${year}`, subSeq, `INV-${year}`, invSeq]
  );

  return { IDS };
}

if (require.main === module) {
  const isLarge = process.argv.includes('--large');
  seedDatabase({ isLarge })
    .then(async () => {
      console.log(
        `[Seed] Database seeded successfully (${isLarge ? 'large' : 'standard'} mode).`
      );
      await db.closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed] Failed:', err);
      await db.closeDb();
      process.exit(1);
    });
}

module.exports = { seedDatabase, IDS };



