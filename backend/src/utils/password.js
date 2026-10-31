const { Errors } = require('./errors.js');

function checkPasswordRules(password, fieldName = 'password') {
  const details = [];
  if (typeof password !== 'string' || password.length < 9) {
    details.push({
      field: fieldName,
      message: 'Must be more than 8 characters (at least 9)',
    });
  }
  if (typeof password !== 'string' || !/[A-Z]/.test(password)) {
    details.push({
      field: fieldName,
      message: 'Must contain at least one uppercase letter',
    });
  }
  if (typeof password !== 'string' || !/[a-z]/.test(password)) {
    details.push({
      field: fieldName,
      message: 'Must contain at least one lowercase letter',
    });
  }
  if (typeof password !== 'string' || !/[^A-Za-z0-9]/.test(password)) {
    details.push({
      field: fieldName,
      message: 'Must contain at least one special character',
    });
  }
  return details;
}

function assertValidPassword(password, fieldName = 'password') {
  const details = checkPasswordRules(password, fieldName);
  if (details.length > 0) {
    throw Errors.validation('Some fields are invalid', details);
  }
}

module.exports = {
  checkPasswordRules,
  assertValidPassword,
};



