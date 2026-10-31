const jwt = require('jsonwebtoken');
const config = require('../config/index.js');
const db = require('../database/db.js');
const { Errors, asyncHandler } = require('../utils/errors.js');

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      iatMs: Date.now(),
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Errors.unauthenticated();
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw Errors.unauthenticated();
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (_) {
    throw Errors.unauthenticated();
  }

  if (!payload || !payload.sub) {
    throw Errors.unauthenticated();
  }

  const userRes = await db.query(`SELECT * FROM users WHERE id = $1`, [
    payload.sub,
  ]);
  const user = userRes.rows[0];
  if (!user) {
    throw Errors.unauthenticated();
  }

  if (user.status === 'disabled') {
    throw Errors.accountDisabled();
  }

  if (user.password_changed_at) {
    const changedMs = new Date(user.password_changed_at).getTime();
    const tokenMs = payload.iatMs || (payload.iat ? payload.iat * 1000 : 0);
    if (tokenMs < changedMs) {
      throw Errors.unauthenticated();
    }
  }

  // Forced password change check (Section 5: only GET /auth/me and POST /auth/change-password allowed)
  if (user.must_change_password) {
    const fullPath = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/+$/, '');
    const isGetMe =
      req.method === 'GET' && fullPath.endsWith('/auth/me');
    const isChangePwd =
      req.method === 'POST' && fullPath.endsWith('/auth/change-password');
    if (!isGetMe && !isChangePwd) {
      throw Errors.passwordChangeRequired();
    }
  }

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.must_change_password,
    customerId: user.customer_id,
    lastLoginAt: user.last_login_at,
  };

  next();
});

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(Errors.unauthenticated());
    }
    if (!roles.includes(req.user.role)) {
      return next(Errors.forbidden());
    }
    return next();
  };
}

module.exports = {
  signToken,
  authenticate,
  requireRole,
};



