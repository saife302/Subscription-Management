const nodemailer = require('nodemailer');
const config = require('../config/index.js');

const sentEmailsLog = [];

async function sendViaBrevo({ toEmail, toName, templateId, params, subject, htmlContent }) {
  const entry = {
    toEmail,
    toName,
    templateId,
    params,
    subject,
    htmlContent,
    sentAt: new Date().toISOString(),
  };
  sentEmailsLog.push(entry);

  if (config.emailProvider === 'console' || !config.brevoApiKey) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[Mailer:console] To=${toEmail} Subject="${subject}"`,
        params?.resetUrl ? `ResetURL=${params.resetUrl}` : ''
      );
    }
    return { messageId: `console-${Date.now()}`, mode: 'console' };
  }

  // Case 1: SMTP Relay key (starts with xsmtpsib-) when BREVO_SMTP_LOGIN is provided
  if (config.brevoApiKey.startsWith('xsmtpsib-') && config.brevoSmtpLogin) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: config.brevoSmtpLogin,
          pass: config.brevoApiKey,
        },
      });
      const info = await transporter.sendMail({
        from: `"${config.brevoSenderName}" <${config.brevoSenderEmail}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject,
        html: htmlContent,
      });
      console.log('[Mailer:smtp] Sent messageId:', info.messageId);
      return { messageId: info.messageId, mode: 'smtp' };
    } catch (err) {
      console.error('[Mailer:smtp] Error sending via Brevo SMTP:', err.message);
    }
  }

  // Case 2: Brevo HTTP API v3 (xkeysib-)
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
      console.warn(
        `[Mailer:fallback] Brevo API returned ${res.status} (${data?.message || 'unauthorized'}). Logged email for ${toEmail}: "${subject}"`,
        params?.resetUrl ? `ResetURL=${params.resetUrl}` : ''
      );
      return { messageId: `fallback-${Date.now()}`, mode: 'fallback' };
    }
    console.log('[Mailer:brevo] Sent messageId:', data.messageId);
    return { ...data, mode: 'brevo' };
  } catch (err) {
    console.error('[Mailer:brevo] Error calling Brevo API:', err.message);
    return { messageId: `fallback-${Date.now()}`, mode: 'fallback' };
  }
}

async function sendPasswordReset({ email, name, resetUrl, expiresInMinutes = 30 }) {
  const templateId = config.brevoTemplateResetId;
  const subject = 'Reset your SubNex password';
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #0f172a;">
      <div style="font-weight: 700; font-size: 18px; margin-bottom: 16px; color: #0f172a;">SubNex</div>
      <h2 style="font-size: 20px; margin: 0 0 12px;">Reset your password</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hi ${name || 'there'},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Use the link below to set a new password for your SubNex account. This link is valid for ${expiresInMinutes} minutes.</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">Reset Password</a>
      </p>
      <p style="font-size: 12px; color: #64748b;">Or copy and paste this URL into your browser:<br/>${resetUrl}</p>
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
  const amountInr = (totalPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const subject = `Quotation ${subscriptionNumber} from ${config.company.name}`;
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #0f172a;">
      <div style="font-weight: 700; font-size: 18px; margin-bottom: 16px; color: #0f172a;">${config.company.name}</div>
      <h2 style="font-size: 20px; margin: 0 0 12px;">Quotation ${subscriptionNumber}</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hi ${name || 'there'},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Your subscription quotation <strong>${subscriptionNumber}</strong> for <strong>&#8377;${amountInr}</strong> is ready for review${validUntil ? ` and valid until ${validUntil}` : ''}.</p>
      <p style="margin: 24px 0;">
        <a href="${portalUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">Review &amp; Accept in Portal</a>
      </p>
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
  const totalInr = (totalPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const balanceInr = (balancePaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const subject = `Invoice ${invoiceNumber} from ${config.company.name}`;
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #0f172a;">
      <div style="font-weight: 700; font-size: 18px; margin-bottom: 16px; color: #0f172a;">${config.company.name}</div>
      <h2 style="font-size: 20px; margin: 0 0 12px;">Tax Invoice ${invoiceNumber}</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hi ${name || 'there'},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Invoice <strong>${invoiceNumber}</strong> for <strong>&#8377;${totalInr}</strong> (Balance due: <strong>&#8377;${balanceInr}</strong>) is due on <strong>${dueDate}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${portalUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">View &amp; Pay Invoice</a>
      </p>
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
