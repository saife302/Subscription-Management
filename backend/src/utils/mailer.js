const config = require('../config/index.js');

const sentEmailsLog = [];

async function sendViaBrevo({ toEmail, toName, templateId, params, subject, htmlContent }) {
  if (config.emailProvider === 'console' || !config.brevoApiKey) {
    sentEmailsLog.push({
      toEmail,
      toName,
      templateId,
      params,
      subject,
      sentAt: new Date().toISOString(),
    });
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[Mailer:console] To=${toEmail} Subject="${subject}"`,
        params?.resetUrl ? `ResetURL=${params.resetUrl}` : ''
      );
    }
    return { messageId: `console-${Date.now()}` };
  }

  const body = {
    sender: {
      name: config.brevoSenderName,
      email: config.brevoSenderEmail,
    },
    to: [{ email: toEmail, name: toName || toEmail }],
  };

  if (templateId) {
    body.templateId = Number(templateId);
    body.params = params;
  } else {
    body.subject = subject;
    body.htmlContent = htmlContent;
    if (params) body.params = params;
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Mailer:brevo] Failed sending email:', res.status, data);
      return null;
    }
    console.log('[Mailer:brevo] Sent messageId:', data.messageId);
    return data;
  } catch (err) {
    console.error('[Mailer:brevo] Error calling Brevo API:', err.message);
    return null;
  }
}

async function sendPasswordReset({ email, name, resetUrl, expiresInMinutes = 30 }) {
  const templateId = config.brevoTemplateResetId;
  const subject = 'Reset your Brightloop password';
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2>Reset your password</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Click the link below to reset your Brightloop password. This link expires in ${expiresInMinutes} minutes.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
    </div>
  `;
  return sendViaBrevo({
    toEmail: email,
    toName: name,
    templateId,
    params: { name, resetUrl, expiresInMinutes },
    subject,
    htmlContent,
  });
}

async function sendQuotation({ email, name, subscriptionNumber, validUntil, totalPaise }) {
  const portalUrl = `${config.webUrl}/login`;
  const amountInr = (totalPaise / 100).toFixed(2);
  const subject = `Quotation ${subscriptionNumber} from ${config.company.name}`;
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2>Quotation ${subscriptionNumber}</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Your quotation <strong>${subscriptionNumber}</strong> for <strong>â‚¹${amountInr}</strong> is ready and valid until ${validUntil}.</p>
      <p><a href="${portalUrl}">View and accept in Customer Portal</a></p>
    </div>
  `;
  return sendViaBrevo({
    toEmail: email,
    toName: name,
    templateId: null,
    params: { name, subscriptionNumber, validUntil, amountInr, portalUrl },
    subject,
    htmlContent,
  });
}

async function sendInvoice({ email, name, invoiceNumber, dueDate, totalPaise, balancePaise }) {
  const portalUrl = `${config.webUrl}/login`;
  const totalInr = (totalPaise / 100).toFixed(2);
  const balanceInr = (balancePaise / 100).toFixed(2);
  const subject = `Invoice ${invoiceNumber} from ${config.company.name}`;
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2>Invoice ${invoiceNumber}</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Invoice <strong>${invoiceNumber}</strong> for <strong>â‚¹${totalInr}</strong> (Balance due: <strong>â‚¹${balanceInr}</strong>) is due on ${dueDate}.</p>
      <p><a href="${portalUrl}">View Invoice in Customer Portal</a></p>
    </div>
  `;
  return sendViaBrevo({
    toEmail: email,
    toName: name,
    templateId: null,
    params: { name, invoiceNumber, dueDate, totalInr, balanceInr, portalUrl },
    subject,
    htmlContent,
  });
}

module.exports = {
  sendPasswordReset,
  sendQuotation,
  sendInvoice,
  sentEmailsLog,
};



