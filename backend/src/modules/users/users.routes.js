const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../../database/db.js');
const { authenticate, requireRole } = require('../../middleware/auth.js');
const { importAdminRateLimiter } = require('../../middleware/rateLimit.js');
const { Errors, asyncHandler } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const { checkPasswordRules } = require('../../utils/password.js');
const { toIsoString } = require('../../utils/dates.js');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB limit
});

router.use(authenticate, requireRole('admin'));

function formatAdminUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    createdVia: row.created_via,
    lastLoginAt: toIsoString(row.last_login_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAccessLevel(raw) {
  if (typeof raw !== 'string') return null;
  const norm = raw.trim().toLowerCase();
  if (norm === 'internal staff' || norm === 'staff') return 'staff';
  if (norm === 'finance lead' || norm === 'finance') return 'finance';
  if (norm === 'admin') return 'admin';
  return null;
}

// GET /users/import/template
router.get('/import/template', (_req, res) => {
  const csv =
    'name,email,temporary_password,access_level\n' +
    'Riya Sharma,riya@brightloop.test,Welcome@2026!,Internal Staff\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="sample-users-template.csv"'
  );
  return res.status(200).send(csv);
});

// POST /users/import
router.post(
  '/import',
  importAdminRateLimiter,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return next(
          Errors.importInvalid(
            err.code === 'LIMIT_FILE_SIZE'
              ? 'CSV file exceeds 1 MB limit'
              : 'Invalid file upload'
          )
        );
      }
      return next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw Errors.importInvalid('CSV file is required in field "file"');
    }

    const origName = (req.file.originalname || '').toLowerCase();
    if (!origName.endsWith('.csv')) {
      throw Errors.importInvalid('Only .csv files are allowed');
    }

    const dryRunParam =
      req.query.dryRun !== undefined ? req.query.dryRun : req.body?.dryRun;
    const dryRun =
      dryRunParam === true ||
      dryRunParam === 'true' ||
      dryRunParam === '1';

    const content = req.file.buffer.toString('utf8');

    let recordsWithInfo;
    try {
      recordsWithInfo = parse(content, {
        bom: true,
        skip_empty_lines: true,
        trim: false,
        info: true,
        relax_column_count: true,
      });
    } catch (_) {
      throw Errors.importInvalid('Malformed CSV file');
    }

    if (!recordsWithInfo || recordsWithInfo.length < 1) {
      throw Errors.importInvalid('CSV file is empty');
    }

    const headerRow = recordsWithInfo[0].record.map((h) =>
      String(h || '')
        .trim()
        .toLowerCase()
    );
    const requiredCols = [
      'name',
      'email',
      'temporary_password',
      'access_level',
    ];
    for (const col of requiredCols) {
      if (!headerRow.includes(col)) {
        throw Errors.importInvalid(`Missing required column: ${col}`);
      }
    }

    const dataRecords = recordsWithInfo.slice(1);
    if (dataRecords.length === 0) {
      throw Errors.importInvalid('CSV file has no data rows');
    }
    if (dataRecords.length > 200) {
      throw Errors.importInvalid('CSV file exceeds maximum of 200 data rows');
    }

    const colIdx = {
      name: headerRow.indexOf('name'),
      email: headerRow.indexOf('email'),
      temporary_password: headerRow.indexOf('temporary_password'),
      access_level: headerRow.indexOf('access_level'),
    };

    // Fetch existing emails from database
    const existingRes = await db.query(`SELECT email FROM users`);
    const existingEmails = new Set(
      existingRes.rows.map((r) => r.email.toLowerCase())
    );

    const seenInFile = new Set();
    const evaluatedRows = [];
    const toInsert = [];

    for (let i = 0; i < dataRecords.length; i++) {
      const item = dataRecords[i];
      const rec = item.record;
      const rowNum = item.info?.lines || i + 2;

      const rawName = String(rec[colIdx.name] ?? '').trim();
      const rawEmail = String(rec[colIdx.email] ?? '')
        .trim()
        .toLowerCase();
      const rawPwd = String(rec[colIdx.temporary_password] ?? '');
      const rawAccess = String(rec[colIdx.access_level] ?? '').trim();

      const rowErrors = [];

      if (!rawName || rawName.length < 2 || rawName.length > 80) {
        rowErrors.push({
          field: 'name',
          message: 'Name is required (2 to 80 characters)',
        });
      }

      if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        rowErrors.push({
          field: 'email',
          message: 'Not a valid email',
        });
      } else if (existingEmails.has(rawEmail)) {
        rowErrors.push({
          field: 'email',
          message: 'Email already has an account',
        });
      } else if (seenInFile.has(rawEmail)) {
        rowErrors.push({
          field: 'email',
          message: 'Email is repeated in this file',
        });
      } else {
        seenInFile.add(rawEmail);
      }

      const pwdErrs = checkPasswordRules(rawPwd, 'temporary_password');
      rowErrors.push(...pwdErrs);

      const mappedRole = mapAccessLevel(rawAccess);
      if (!mappedRole) {
        rowErrors.push({
          field: 'access_level',
          message: 'Must be Internal Staff, Finance Lead or Admin',
        });
      }

      const isValid = rowErrors.length === 0;
      evaluatedRows.push({
        row: rowNum,
        name: rawName,
        email: rawEmail,
        role: mappedRole,
        status: isValid ? 'valid' : 'invalid',
        errors: rowErrors,
      });

      if (isValid) {
        toInsert.push({
          name: rawName,
          email: rawEmail,
          password: rawPwd,
          role: mappedRole,
        });
      }
    }

    const validCount = evaluatedRows.filter((r) => r.status === 'valid').length;
    const invalidCount = evaluatedRows.length - validCount;

    if (dryRun || invalidCount > 0) {
      return res.status(200).json({
        data: {
          dryRun,
          total: evaluatedRows.length,
          valid: validCount,
          invalid: invalidCount,
          created: 0,
          rows: evaluatedRows,
        },
      });
    }

    // Hash all passwords in parallel
    const hashedItems = await Promise.all(
      toInsert.map(async (u) => ({
        id: generateId(),
        name: u.name,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
        role: u.role,
      }))
    );

    await db.withTransaction(async (client) => {
      for (const u of hashedItems) {
        await client.query(
          `INSERT INTO users (id, name, email, password_hash, role, status, must_change_password, created_via, created_by)
           VALUES ($1, $2, $3, $4, $5, 'active', TRUE, 'import', $6)`,
          [u.id, u.name, u.email, u.passwordHash, u.role, req.user.id]
        );
      }
    });

    const createdRows = evaluatedRows.map((r) => ({
      ...r,
      status: 'created',
    }));

    return res.status(201).json({
      data: {
        dryRun: false,
        total: createdRows.length,
        valid: validCount,
        invalid: 0,
        created: createdRows.length,
        rows: createdRows,
      },
    });
  })
);

// GET /users
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit || '20', 10) || 20)
    );
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (req.query.role) {
      params.push(String(req.query.role));
      conditions.push(`role = $${params.length}`);
    }
    if (req.query.status) {
      params.push(String(req.query.status));
      conditions.push(`status = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR email ILIKE $${params.length})`
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM users ${whereClause}`,
      params
    );
    const total = countRes.rows[0].total;

    const sortParam = String(req.query.sort || '-createdAt');
    const desc = sortParam.startsWith('-');
    const rawField = desc ? sortParam.slice(1) : sortParam;
    const sortMap = {
      createdAt: 'created_at',
      name: 'name',
      email: 'email',
      role: 'role',
    };
    const sortCol = sortMap[rawField] || 'created_at';
    const sortDir = desc ? 'DESC' : 'ASC';

    const listRes = await db.query(
      `SELECT * FROM users ${whereClause}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      data: listRes.rows.map(formatAdminUser),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  })
);

// POST /users
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const details = [];

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body.role;
    const temporaryPassword = body.temporaryPassword;

    if (!name || name.length < 2 || name.length > 80) {
      details.push({
        field: 'name',
        message: 'Name is required (2 to 80 characters)',
      });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      details.push({ field: 'email', message: 'Valid email is required' });
    }
    if (!['admin', 'staff', 'finance'].includes(role)) {
      details.push({
        field: 'role',
        message: 'Role must be admin, staff or finance',
      });
    }
    details.push(
      ...checkPasswordRules(temporaryPassword, 'temporaryPassword')
    );

    if (details.length > 0) {
      throw Errors.validation('Some fields are invalid', details);
    }

    const existing = await db.query(`SELECT id FROM users WHERE email = $1`, [
      email,
    ]);
    if (existing.rowCount > 0) {
      throw Errors.emailTaken();
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const id = generateId();

    const ins = await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, status, must_change_password, created_via, created_by)
       VALUES ($1, $2, $3, $4, $5, 'active', TRUE, 'admin', $6)
       RETURNING *`,
      [id, name, email, passwordHash, role, req.user.id]
    );

    return res.status(201).json({
      data: formatAdminUser(ins.rows[0]),
    });
  })
);

// PATCH /users/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    const userRes = await db.query(`SELECT * FROM users WHERE id = $1`, [id]);
    const user = userRes.rows[0];
    if (!user) throw Errors.notFound();

    const details = [];
    const newName =
      body.name !== undefined ? String(body.name).trim() : user.name;
    const newRole = body.role !== undefined ? body.role : user.role;
    const newStatus = body.status !== undefined ? body.status : user.status;

    if (!newName || newName.length < 2 || newName.length > 80) {
      details.push({
        field: 'name',
        message: 'Name must be between 2 and 80 characters',
      });
    }
    if (
      body.role !== undefined &&
      !['admin', 'staff', 'finance'].includes(newRole)
    ) {
      details.push({
        field: 'role',
        message: 'Role must be admin, staff or finance',
      });
    }
    if (!['active', 'disabled'].includes(newStatus)) {
      details.push({
        field: 'status',
        message: 'Status must be active or disabled',
      });
    }
    if (details.length > 0) {
      throw Errors.validation('Some fields are invalid', details);
    }

    // Check LAST_ADMIN rule
    const wasActiveAdmin = user.role === 'admin' && user.status === 'active';
    const willBeActiveAdmin = newRole === 'admin' && newStatus === 'active';

    if (wasActiveAdmin && !willBeActiveAdmin) {
      const adminCountRes = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'admin' AND status = 'active' AND id != $1`,
        [user.id]
      );
      if (adminCountRes.rows[0].cnt === 0) {
        throw Errors.lastAdmin();
      }
    }

    const upd = await db.query(
      `UPDATE users
       SET name = $1, role = $2, status = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newName, newRole, newStatus, id]
    );

    return res.status(200).json({
      data: formatAdminUser(upd.rows[0]),
    });
  })
);

// POST /users/:id/reset-password
router.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { temporaryPassword } = req.body || {};

    const userRes = await db.query(`SELECT * FROM users WHERE id = $1`, [id]);
    if (userRes.rowCount === 0) {
      throw Errors.notFound();
    }

    const pwdDetails = checkPasswordRules(
      temporaryPassword,
      'temporaryPassword'
    );
    if (pwdDetails.length > 0) {
      throw Errors.validation('Some fields are invalid', pwdDetails);
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const changedAt = new Date();

    const upd = await db.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = TRUE,
           password_changed_at = $2,
           updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [passwordHash, changedAt, id]
    );

    return res.status(200).json({
      data: formatAdminUser(upd.rows[0]),
    });
  })
);

module.exports = router;



