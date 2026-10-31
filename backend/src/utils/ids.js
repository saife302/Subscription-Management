const crypto = require('crypto');
const db = require('../database/db.js');

function generateId() {
  const timestampHex = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  const randomHex = crypto.randomBytes(8).toString('hex');
  return `${timestampHex}${randomHex}`;
}

async function nextNumber(prefix, year, client = db) {
  const counterId = `${prefix}-${year}`;
  const res = await client.query(
    `INSERT INTO counters (id, seq)
     VALUES ($1, 1)
     ON CONFLICT (id) DO UPDATE SET seq = counters.seq + 1
     RETURNING seq`,
    [counterId]
  );
  const seq = Number(res.rows[0].seq);
  return `${prefix}/${year}/${String(seq).padStart(4, '0')}`;
}

module.exports = {
  generateId,
  nextNumber,
};



