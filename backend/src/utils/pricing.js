const db = require('../database/db.js');
const { getTodayIST } = require('./dates.js');

function computeDiscountState(discount, onDate = getTodayIST()) {
  if (!discount.is_active && discount.isActive !== true) {
    return 'inactive';
  }
  const usageLimit = discount.usage_limit ?? discount.usageLimit ?? null;
  const usedCount = Number(discount.used_count ?? discount.usedCount ?? 0);
  if (usageLimit !== null && usedCount >= usageLimit) {
    return 'exhausted';
  }
  const startDate = discount.start_date || discount.startDate;
  const endDate = discount.end_date || discount.endDate;
  if (onDate < startDate) {
    return 'scheduled';
  }
  if (onDate > endDate) {
    return 'expired';
  }
  return 'running';
}

/**
 * Core pricing engine (Section 14)
 * Used everywhere: preview, subscription detail, billing run, and "Create invoice now".
 */
async function priceLines(subscription, onDate = getTodayIST(), options = {}) {
  const client = options.client || db;
  const excludedDiscountIds = new Set(options.excludedDiscountIds || []);

  const rawLines = subscription.lines || [];
  if (rawLines.length === 0) {
    return {
      lines: [],
      orderDiscount: null,
      totals: {
        untaxedAmount: 0,
        discountTotal: 0,
        taxTotal: 0,
        total: 0,
      },
      recurringTotal: 0,
      recurringNet: 0,
      appliedDiscountIds: [],
    };
  }

  // Load products for product types, names, variants
  const productIds = [...new Set(rawLines.map((l) => l.productId))];
  const prodRes = await client.query(
    `SELECT * FROM products WHERE id = ANY($1::text[])`,
    [productIds]
  );
  const productMap = new Map(prodRes.rows.map((p) => [p.id, p]));

  // Load active taxes
  const taxRes = await client.query(
    `SELECT * FROM taxes WHERE is_active = TRUE ORDER BY created_at ASC`
  );
  const activeTaxes = taxRes.rows;

  // Load active discounts that are running on onDate
  const discRes = await client.query(
    `SELECT * FROM discounts
     WHERE is_active = TRUE
       AND start_date <= $1
       AND end_date >= $1
       AND (usage_limit IS NULL OR used_count < usage_limit)
     ORDER BY created_at ASC`,
    [onDate]
  );
  const runningDiscounts = discRes.rows.filter(
    (d) => !excludedDiscountIds.has(d.id)
  );

  // Step 1: Compute line subtotals
  const pricedLines = rawLines.map((line) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const subtotal = unitPrice * quantity;
    return {
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      variantId: line.variantId ?? null,
      variantLabel: line.variantLabel ?? null,
      quantity,
      unitPrice,
      subtotal,
      discount: null,
      orderDiscountShare: 0,
      taxes: [],
      taxAmount: 0,
      total: 0,
    };
  });

  const subscriptionSubtotal = pricedLines.reduce((acc, l) => acc + l.subtotal, 0);
  const totalQuantity = pricedLines.reduce((acc, l) => acc + l.quantity, 0);

  const appliedDiscountIdsSet = new Set();

  // Step 2: Line discounts (appliesTo.kind === 'products')
  const productDiscounts = runningDiscounts.filter(
    (d) => d.applies_to && d.applies_to.kind === 'products'
  );

  for (const line of pricedLines) {
    let bestDiscount = null;
    let bestAmount = 0;

    for (const d of productDiscounts) {
      const targetProdIds = d.applies_to.productIds || [];
      if (!targetProdIds.includes(line.productId)) continue;
      if (d.min_quantity !== null && line.quantity < Number(d.min_quantity)) {
        continue;
      }
      if (
        d.min_purchase_amount !== null &&
        subscriptionSubtotal < Number(d.min_purchase_amount)
      ) {
        continue;
      }

      const val = Number(d.value);
      let amount = 0;
      if (d.type === 'percentage') {
        amount = Math.round((line.subtotal * val) / 100);
      } else {
        amount = Math.min(Math.round(val), line.subtotal);
      }

      if (amount > bestAmount) {
        bestAmount = amount;
        bestDiscount = d;
      }
    }

    if (bestDiscount && bestAmount > 0) {
      line.discount = {
        discountId: bestDiscount.id,
        name: bestDiscount.name,
        amount: bestAmount,
      };
      appliedDiscountIdsSet.add(bestDiscount.id);
    }
  }

  // Step 3: Subscription discount (appliesTo.kind === 'subscription')
  // Discounts never stack (Section 14 & Section 17): only apply a subscription-level
  // discount when no line discount has been applied on the invoice.
  const lineDiscountSumSoFar = pricedLines.reduce(
    (acc, l) => acc + (l.discount ? l.discount.amount : 0),
    0
  );
  const netAfterLineDiscounts = pricedLines.reduce(
    (acc, l) => acc + (l.subtotal - (l.discount ? l.discount.amount : 0)),
    0
  );

  const subDiscounts =
    lineDiscountSumSoFar === 0
      ? runningDiscounts.filter(
          (d) => d.applies_to && d.applies_to.kind === 'subscription'
        )
      : [];

  let bestOrderDiscount = null;
  let bestOrderDiscountAmount = 0;

  for (const d of subDiscounts) {
    if (d.min_quantity !== null && totalQuantity < Number(d.min_quantity)) {
      continue;
    }
    if (
      d.min_purchase_amount !== null &&
      netAfterLineDiscounts < Number(d.min_purchase_amount)
    ) {
      continue;
    }

    const val = Number(d.value);
    let amount = 0;
    if (d.type === 'percentage') {
      amount = Math.round((netAfterLineDiscounts * val) / 100);
    } else {
      amount = Math.min(Math.round(val), netAfterLineDiscounts);
    }

    if (amount > bestOrderDiscountAmount) {
      bestOrderDiscountAmount = amount;
      bestOrderDiscount = d;
    }
  }

  let orderDiscount = null;
  if (bestOrderDiscount && bestOrderDiscountAmount > 0 && netAfterLineDiscounts > 0) {
    orderDiscount = {
      discountId: bestOrderDiscount.id,
      name: bestOrderDiscount.name,
      amount: bestOrderDiscountAmount,
    };
    appliedDiscountIdsSet.add(bestOrderDiscount.id);

    // Split across lines in proportion to their net amounts; rounding remainder goes to largest line
    let sumShares = 0;
    let largestIdx = 0;
    let largestNet = -1;

    pricedLines.forEach((line, idx) => {
      const lineNet = line.subtotal - (line.discount ? line.discount.amount : 0);
      if (lineNet > largestNet) {
        largestNet = lineNet;
        largestIdx = idx;
      }
      const share = Math.round(
        (bestOrderDiscountAmount * lineNet) / netAfterLineDiscounts
      );
      line.orderDiscountShare = share;
      sumShares += share;
    });

    const remainder = bestOrderDiscountAmount - sumShares;
    pricedLines[largestIdx].orderDiscountShare += remainder;
  }

  // Step 4: Taxes per line on (subtotal - lineDiscount - orderDiscountShare)
  for (const line of pricedLines) {
    const product = productMap.get(line.productId);
    const productType = product ? product.type : null;
    const lineDiscountAmt = line.discount ? line.discount.amount : 0;
    const base = Math.max(0, line.subtotal - lineDiscountAmt - line.orderDiscountShare);

    const lineTaxes = [];
    let lineTaxAmount = 0;

    for (const tax of activeTaxes) {
      const applies = tax.applies_to || {};
      let matches = false;
      if (applies.kind === 'all') {
        matches = true;
      } else if (applies.kind === 'productTypes') {
        matches =
          Array.isArray(applies.productTypes) &&
          applies.productTypes.includes(productType);
      } else if (applies.kind === 'products') {
        matches =
          Array.isArray(applies.productIds) &&
          applies.productIds.includes(line.productId);
      }

      if (!matches) continue;

      const rate = Number(tax.rate);
      let amount = 0;
      if (tax.type === 'percentage') {
        amount = Math.round((base * rate) / 100);
      } else {
        amount = Math.round(rate * line.quantity);
      }

      lineTaxes.push({
        taxId: tax.id,
        name: tax.name,
        type: tax.type,
        rate,
        amount,
      });
      lineTaxAmount += amount;
    }

    line.taxes = lineTaxes;
    line.taxAmount = lineTaxAmount;
    line.total = base + lineTaxAmount;
  }

  // Step 5: Totals
  const untaxedAmount = pricedLines.reduce((acc, l) => acc + l.subtotal, 0);
  const lineDiscountSum = pricedLines.reduce(
    (acc, l) => acc + (l.discount ? l.discount.amount : 0),
    0
  );
  const discountTotal =
    lineDiscountSum + (orderDiscount ? orderDiscount.amount : 0);
  const taxTotal = pricedLines.reduce((acc, l) => acc + l.taxAmount, 0);
  const total = untaxedAmount - discountTotal + taxTotal;
  const recurringNet = untaxedAmount - discountTotal;
  const recurringTotal = total;

  return {
    lines: pricedLines,
    orderDiscount,
    totals: {
      untaxedAmount,
      discountTotal,
      taxTotal,
      total,
    },
    recurringTotal,
    recurringNet,
    appliedDiscountIds: [...appliedDiscountIdsSet],
  };
}

module.exports = {
  computeDiscountState,
  priceLines,
};



