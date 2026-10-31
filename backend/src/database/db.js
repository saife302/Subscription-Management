const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const config = require('../config/index.js');

// Parse PostgreSQL INT8 (BIGINT, OID 20) and NUMERIC (OID 1700) as JS Numbers
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

let pool = null;
let pgliteInstance = null;
let txQueue = Promise.resolve();

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'bigint') {
        out[k] = Number(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

const schemaPath = path.join(__dirname, 'migrations', '0001_initial.sql');

async function initDb() {
  if (process.env.USE_PGLITE === 'true') {
    if (!pgliteInstance) {
      const { PGlite } = await import('@electric-sql/pglite');
      pgliteInstance = new PGlite(process.env.PGLITE_DATA_DIR || undefined);
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pgliteInstance.exec(schemaSql);
    }
    return;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schemaSql);
}

async function query(text, params = []) {
  if (process.env.USE_PGLITE === 'true') {
    if (!pgliteInstance) {
      await initDb();
    }
    const res = await pgliteInstance.query(text, params, {
      parsers: {
        20: (val) => parseInt(val, 10),
        1700: (val) => parseFloat(val),
      },
    });
    return {
      rows: normalizeRows(res.rows),
      rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
    };
  }

  if (!pool) {
    await initDb();
  }
  const res = await pool.query(text, params);
  return {
    rows: normalizeRows(res.rows),
    rowCount: res.rowCount,
  };
}

async function withTransaction(fn) {
  if (process.env.USE_PGLITE === 'true') {
    if (!pgliteInstance) {
      await initDb();
    }
    let release;
    const prev = txQueue;
    txQueue = new Promise((r) => {
      release = r;
    });
    await prev;
    try {
      await pgliteInstance.query('BEGIN');
      const client = {
        query: async (text, params = []) => {
          const res = await pgliteInstance.query(text, params, {
            parsers: {
              20: (val) => parseInt(val, 10),
              1700: (val) => parseFloat(val),
            },
          });
          return {
            rows: normalizeRows(res.rows),
            rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
          };
        },
      };
      const result = await fn(client);
      await pgliteInstance.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await pgliteInstance.query('ROLLBACK');
      } catch (_) {}
      throw err;
    } finally {
      release();
    }
  }

  if (!pool) {
    await initDb();
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wrappedClient = {
      query: async (text, params = []) => {
        const res = await client.query(text, params);
        return {
          rows: normalizeRows(res.rows),
          rowCount: res.rowCount,
        };
      },
    };
    const result = await fn(wrappedClient);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function checkHealth() {
  try {
    await query('SELECT 1');
    return true;
  } catch (_) {
    return false;
  }
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
}

module.exports = {
  initDb,
  query,
  withTransaction,
  checkHealth,
  closeDb,
};


