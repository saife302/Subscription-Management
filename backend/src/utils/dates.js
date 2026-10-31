const { addDays, addWeeks, addMonths, addYears } = require('date-fns');

function getTodayIST() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function isValidDateStr(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function formatDateObj(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysStr(dateStr, days) {
  const dt = parseDateStr(dateStr);
  return formatDateObj(addDays(dt, days));
}

function addBillingPeriod(dateStr, billingPeriod, count = 1) {
  const dt = parseDateStr(dateStr);
  let next;
  switch (billingPeriod) {
    case 'daily':
      next = addDays(dt, count);
      break;
    case 'weekly':
      next = addWeeks(dt, count);
      break;
    case 'monthly':
      next = addMonths(dt, count);
      break;
    case 'yearly':
      next = addYears(dt, count);
      break;
    default:
      next = addMonths(dt, count);
  }
  return formatDateObj(next);
}

function getPeriodEnd(periodStartStr, billingPeriod) {
  const nextStart = addBillingPeriod(periodStartStr, billingPeriod, 1);
  return addDaysStr(nextStart, -1);
}

function defaultExpiryDate(startDateStr) {
  const nextYear = addBillingPeriod(startDateStr, 'yearly', 1);
  return addDaysStr(nextYear, -1);
}

function daysBetween(fromDateStr, toDateStr) {
  const [y1, m1, d1] = fromDateStr.split('-').map(Number);
  const [y2, m2, d2] = toDateStr.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

function toIsoString(val) {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = {
  getTodayIST,
  isValidDateStr,
  addDaysStr,
  addBillingPeriod,
  getPeriodEnd,
  defaultExpiryDate,
  daysBetween,
  toIsoString,
};



