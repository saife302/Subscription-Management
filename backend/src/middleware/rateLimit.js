const { Errors } = require('../utils/errors.js');

const buckets = new Map();

function checkLimit(key, maxRequests, windowMs) {
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    return true;
  }
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

function authIpRateLimiter(req, _res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const ok = checkLimit(`auth-ip:${ip}`, 10, 60 * 1000);
  if (!ok) {
    return next(Errors.rateLimited('Too many authentication attempts from this IP'));
  }
  return next();
}

function forgotPasswordEmailLimiter(req, _res, next) {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
  if (!email) return next();
  const ok = checkLimit(`forgot-email:${email}`, 3, 60 * 60 * 1000);
  if (!ok) {
    return next(
      Errors.rateLimited('Too many password reset requests for this email')
    );
  }
  return next();
}

function importAdminRateLimiter(req, _res, next) {
  const adminId = req.user?.id || req.ip || 'unknown';
  const ok = checkLimit(`import-admin:${adminId}`, 5, 60 * 1000);
  if (!ok) {
    return next(Errors.rateLimited('Too many CSV imports, please wait a minute'));
  }
  return next();
}

function resetRateLimits() {
  buckets.clear();
}

module.exports = {
  authIpRateLimiter,
  forgotPasswordEmailLimiter,
  importAdminRateLimiter,
  resetRateLimits,
};



