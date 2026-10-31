/**
 * Queue dispatcher for asynchronous tasks (email dispatch, billing batches).
 */
const {
  sendPasswordReset,
  sendQuotation,
  sendInvoice,
} = require('../services/mailer.service.js');

module.exports = {
  emailQueue: {
    sendPasswordReset,
    sendQuotation,
    sendInvoice,
  },
};


