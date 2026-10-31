const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../../database/db.js');
const config = require('../../config/index.js');
const { signToken, authenticate } = require('../../middleware/auth.js');
const {
  authIpRateLimiter,
  forgotPasswordEmailLimiter,
} = require('../../middleware/rateLimit.js');
const { Errors, asyncHandler, validateZod } = require('../../utils/errors.js');
const { generateId } = require('../../utils/ids.js');
const { checkPasswordRules } = require('../../utils/password.js');
const { toIsoString } = require('../../utils/dates.js');
const { sendPasswordReset } = require('../../services/mailer.service.js');

const router = express.Router();

router.use(authIpRateLimiter);

function formatUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    customerId: row.customer_id || null,
  };
}

// POST /auth/customer/signup
router.post(
  '/customer/signup',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const details = [];

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const companyName =
      typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!name || name.length < 1) {
      details.push({ field: 'name', message: 'Name is required' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      details.push({ field: 'email', message: 'Valid email is required' });
    }
    const pwdDetails = checkPasswordRules(password, 'password');
    details.push(...pwdDetails);

    if (details.length > 0) {
      throw Errors.validation('Some fields are invalid', details);
    }

    const existingUser = await db.query(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );
    if (existingUser.rowCount > 0) {
      throw Errors.emailTaken();
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = generateId();

    const result = await db.withTransaction(async (client) => {
      // Check if staff already created a customer with this email and no login
      const custRes = await client.query(
        `SELECT * FROM customers WHERE email = $1 AND user_id IS NULL ORDER BY created_at ASC LIMIT 1`,
        [email]
      );

      const customerId =
        custRes.rowCount > 0 ? custRes.rows[0].id : generateId();

      const userIns = await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, status, must_change_password, created_via, customer_id, last_login_at)
         VALUES ($1, $2, $3, $4, 'customer', 'active', FALSE, 'signup', $5, NOW())
         RETURNING *`,
        [userId, name, email, passwordHash, customerId]
      );

      if (custRes.rowCount > 0) {
        await client.query(
          `UPDATE customers SET user_id = $1, updated_at = NOW() WHERE id = $2`,
          [userId, customerId]
        );
      } else {
        await client.query(
          `INSERT INTO customers (id, name, contact_name, email, phone, billing_address, tax_id, notes, user_id, is_active)
           VALUES ($1, $2, $3, $4, '', '{}'::jsonb, '', '', $5, TRUE)`,
          [customerId, companyName || name, name, email, userId]
        );
      }

      return userIns.rows[0];
    });

    const userObj = formatUser(result);
    const token = signToken(userObj);

    return res.status(201).json({
      data: {
        token,
        user: userObj,
      },
    });
  })
);

// POST /auth/customer/login
router.post(
  '/customer/login',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      email: z.string().min(1, 'Email is required'),
      password: z.string().min(1, 'Password is required'),
    });
    const { email, password } = validateZod(schema, req.body || {});
    const emailLower = email.trim().toLowerCase();

    const userRes = await db.query(`SELECT * FROM users WHERE email = $1`, [
      emailLower,
    ]);
    const user = userRes.rows[0];

    if (!user || user.role !== 'customer') {
      throw Errors.invalidCredentials();
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw Errors.invalidCredentials();
    }

    if (user.status === 'disabled') {
      throw Errors.accountDisabled();
    }

    await db.query(
      `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [user.id]
    );

    const userObj = formatUser(user);
    const token = signToken(userObj);

    return res.status(200).json({
      data: {
        token,
        user: userObj,
      },
    });
  })
);

// POST /auth/staff/login
router.post(
  '/staff/login',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      email: z.string().min(1, 'Email is required'),
      password: z.string().min(1, 'Password is required'),
    });
    const { email, password } = validateZod(schema, req.body || {});
    const emailLower = email.trim().toLowerCase();

    const userRes = await db.query(`SELECT * FROM users WHERE email = $1`, [
      emailLower,
    ]);
    const user = userRes.rows[0];

    if (!user || !['admin', 'staff', 'finance'].includes(user.role)) {
      throw Errors.invalidCredentials();
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw Errors.invalidCredentials();
    }

    if (user.status === 'disabled') {
      throw Errors.accountDisabled();
    }

    await db.query(
      `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [user.id]
    );

    const userObj = formatUser(user);
    const token = signToken(userObj);

    return res.status(200).json({
      data: {
        token,
        user: userObj,
      },
    });
  })
);

// GET /auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const userRes = await db.query(`SELECT * FROM users WHERE id = $1`, [
      req.user.id,
    ]);
    const user = userRes.rows[0];
    if (!user) throw Errors.unauthenticated();

    const data = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      mustChangePassword: Boolean(user.must_change_password),
      lastLoginAt: toIsoString(user.last_login_at),
    };

    if (user.role === 'customer' && user.customer_id) {
      const custRes = await db.query(`SELECT * FROM customers WHERE id = $1`, [
        user.customer_id,
      ]);
      if (custRes.rows[0]) {
        const c = custRes.rows[0];
        data.customer = {
          id: c.id,
          name: c.name,
          contactName: c.contact_name,
          phone: c.phone || '',
          billingAddress: c.billing_address || {},
          taxId: c.tax_id || '',
        };
      }
    }

    return res.status(200).json({ data });
  })
);

// PATCH /auth/me
router.patch(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        throw Errors.validation('Some fields are invalid', [
          { field: 'name', message: 'Name must be a non-empty string' },
        ]);
      }
      await db.query(
        `UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`,
        [body.name.trim(), req.user.id]
      );
    }

    if (req.user.role === 'customer' && req.user.customerId) {
      const custRes = await db.query(`SELECT * FROM customers WHERE id = $1`, [
        req.user.customerId,
      ]);
      if (custRes.rows[0]) {
        const c = custRes.rows[0];
        const newCompanyName =
          typeof body.companyName === 'string' && body.companyName.trim()
            ? body.companyName.trim()
            : c.name;
        const newContactName =
          typeof body.contactName === 'string'
            ? body.contactName.trim()
            : typeof body.name === 'string'
            ? body.name.trim()
            : c.contact_name;
        const newPhone =
          typeof body.phone === 'string' ? body.phone.trim() : c.phone;
        const newAddress =
          body.billingAddress && typeof body.billingAddress === 'object'
            ? { ...(c.billing_address || {}), ...body.billingAddress }
            : c.billing_address;
        const newTaxId =
          typeof body.taxId === 'string' ? body.taxId.trim() : c.tax_id;

        await db.query(
          `UPDATE customers
           SET name = $1, contact_name = $2, phone = $3, billing_address = $4::jsonb, tax_id = $5, updated_at = NOW()
           WHERE id = $6`,
          [
            newCompanyName,
            newContactName,
            newPhone,
            JSON.stringify(newAddress || {}),
            newTaxId,
            c.id,
          ]
        );
      }
    }

    // Return updated /auth/me payload
    const userRes = await db.query(`SELECT * FROM users WHERE id = $1`, [
      req.user.id,
    ]);
    const user = userRes.rows[0];
    const data = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      mustChangePassword: Boolean(user.must_change_password),
      lastLoginAt: toIsoString(user.last_login_at),
    };

    if (user.role === 'customer' && user.customer_id) {
      const custRes = await db.query(`SELECT * FROM customers WHERE id = $1`, [
        user.customer_id,
      ]);
      if (custRes.rows[0]) {
        const c = custRes.rows[0];
        data.customer = {
          id: c.id,
          name: c.name,
          contactName: c.contact_name,
          phone: c.phone || '',
          billingAddress: c.billing_address || {},
          taxId: c.tax_id || '',
        };
      }
    }

    return res.status(200).json({ data });
  })
);

// POST /auth/change-password
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || typeof currentPassword !== 'string') {
      throw Errors.validation('Some fields are invalid', [
        { field: 'currentPassword', message: 'Current password is required' },
      ]);
    }

    const userRes = await db.query(`SELECT * FROM users WHERE id = $1`, [
      req.user.id,
    ]);
    const user = userRes.rows[0];
    if (!user) throw Errors.unauthenticated();

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      throw Errors.validation('Some fields are invalid', [
        { field: 'currentPassword', message: 'Current password is incorrect' },
      ]);
    }

    const pwdDetails = checkPasswordRules(newPassword, 'newPassword');
    if (newPassword === currentPassword) {
      pwdDetails.push({
        field: 'newPassword',
        message: 'New password must be different from current password',
      });
    }
    if (pwdDetails.length > 0) {
      throw Errors.validation('Some fields are invalid', pwdDetails);
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const changedAt = new Date();

    const upd = await db.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = FALSE,
           password_changed_at = $2,
           updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [newHash, changedAt, user.id]
    );

    const updatedUser = formatUser(upd.rows[0]);
    const token = jwtSignAfterChange(updatedUser, changedAt);

    return res.status(200).json({
      data: {
        token,
        user: updatedUser,
      },
    });
  })
);

function jwtSignAfterChange(userObj, changedAtDate) {
  const jwt = require('jsonwebtoken');
  const iatMs = Math.max(Date.now(), changedAtDate.getTime() + 1);
  return jwt.sign(
    {
      sub: userObj.id,
      role: userObj.role,
      iatMs,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

// POST /auth/forgot-password
router.post(
  '/forgot-password',
  forgotPasswordEmailLimiter,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      email: z.string().email('Valid email is required'),
      portal: z.enum(['customer', 'staff']),
    });
    const { email, portal } = validateZod(schema, req.body || {});
    const emailLower = email.trim().toLowerCase();

    const userRes = await db.query(`SELECT * FROM users WHERE email = $1`, [
      emailLower,
    ]);
    const user = userRes.rows[0];

    const roleMatchesPortal =
      user &&
      ((portal === 'customer' && user.role === 'customer') ||
        (portal === 'staff' &&
          ['admin', 'staff', 'finance'].includes(user.role)));

    if (!user || user.status === 'disabled' || !roleMatchesPortal) {
      return res.status(200).json({ data: { ok: true } });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await db.query(
      `UPDATE users
       SET reset_token_hash = $1, reset_token_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [tokenHash, expiresAt, user.id]
    );

    const resetPath =
      portal === 'customer'
        ? `/reset-password?token=${rawToken}`
        : `/staff/reset-password?token=${rawToken}`;
    const resetUrl = `${config.webUrl}${resetPath}`;

    await sendPasswordReset({
      email: user.email,
      name: user.name,
      resetUrl,
      expiresInMinutes: 30,
    });

    const responseData = { ok: true };
    if (
      config.emailProvider === 'console' &&
      config.nodeEnv === 'development'
    ) {
      responseData.devResetUrl = resetUrl;
    }

    return res.status(200).json({ data: responseData });
  })
);

// POST /auth/reset-password
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body || {};

    if (!token || typeof token !== 'string') {
      throw Errors.tokenInvalid();
    }

    const pwdDetails = checkPasswordRules(newPassword, 'newPassword');
    if (pwdDetails.length > 0) {
      throw Errors.validation('Some fields are invalid', pwdDetails);
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(token.trim())
      .digest('hex');

    const userRes = await db.query(
      `SELECT * FROM users WHERE reset_token_hash = $1`,
      [tokenHash]
    );
    const user = userRes.rows[0];

    if (
      !user ||
      !user.reset_token_expires_at ||
      new Date(user.reset_token_expires_at).getTime() < Date.now()
    ) {
      throw Errors.tokenInvalid();
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const changedAt = new Date();

    const upd = await db.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = FALSE,
           password_changed_at = $2,
           reset_token_hash = NULL,
           reset_token_expires_at = NULL,
           updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [newHash, changedAt, user.id]
    );

    const updatedUser = formatUser(upd.rows[0]);
    const jwtToken = jwtSignAfterChange(updatedUser, changedAt);

    return res.status(200).json({
      data: {
        token: jwtToken,
        user: updatedUser,
      },
    });
  })
);

module.exports = router;



