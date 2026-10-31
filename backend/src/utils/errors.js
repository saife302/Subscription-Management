class AppError extends Error {
  constructor(httpStatus, code, message, details = undefined) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }
}

const Errors = {
  validation(message = 'Some fields are invalid', details = []) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  },
  importInvalid(message = "CSV file can't be read") {
    return new AppError(400, 'IMPORT_INVALID', message);
  },
  tokenInvalid(message = 'Reset link is wrong, already used or expired') {
    return new AppError(400, 'TOKEN_INVALID', message);
  },
  unauthenticated(message = 'Missing, bad or expired JWT') {
    return new AppError(401, 'UNAUTHENTICATED', message);
  },
  invalidCredentials(message = 'Invalid email or password') {
    return new AppError(401, 'INVALID_CREDENTIALS', message);
  },
  forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, 'FORBIDDEN', message);
  },
  accountDisabled(message = 'User account has been disabled by an admin') {
    return new AppError(403, 'ACCOUNT_DISABLED', message);
  },
  passwordChangeRequired(
    message = 'You must change your temporary password before continuing'
  ) {
    return new AppError(403, 'PASSWORD_CHANGE_REQUIRED', message);
  },
  notFound(message = 'Record not found') {
    return new AppError(404, 'NOT_FOUND', message);
  },
  emailTaken(message = 'Email already has an account') {
    return new AppError(409, 'EMAIL_TAKEN', message);
  },
  invalidTransition(message = 'Action not allowed in the current status') {
    return new AppError(409, 'INVALID_TRANSITION', message);
  },
  notEditable(message = 'Record is locked in its current status') {
    return new AppError(409, 'NOT_EDITABLE', message);
  },
  alreadyInvoiced(message = 'This subscription period already has an invoice') {
    return new AppError(409, 'ALREADY_INVOICED', message);
  },
  overpayment(message = 'Payment is larger than the invoice balance') {
    return new AppError(409, 'OVERPAYMENT', message);
  },
  hasPayments(message = "Can't cancel an invoice that has payments") {
    return new AppError(409, 'HAS_PAYMENTS', message);
  },
  planRule(message = "Plan doesn't allow this action") {
    return new AppError(409, 'PLAN_RULE', message);
  },
  belowMinQuantity(message = "Quantity is under the plan's minimum") {
    return new AppError(409, 'BELOW_MIN_QUANTITY', message);
  },
  planNotAvailable(
    message = "Start date is outside the plan's available dates"
  ) {
    return new AppError(409, 'PLAN_NOT_AVAILABLE', message);
  },
  lastAdmin(message = 'Would leave the system with no active admin') {
    return new AppError(409, 'LAST_ADMIN', message);
  },
  rateLimited(message = 'Too many attempts, please try again later') {
    return new AppError(429, 'RATE_LIMITED', message);
  },
};

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function validateZod(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw Errors.validation('Some fields are invalid', details);
  }
  return parsed.data;
}

module.exports = {
  AppError,
  Errors,
  asyncHandler,
  validateZod,
};



