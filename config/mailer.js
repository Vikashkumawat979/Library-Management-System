require('dotenv').config();
const nodemailer = require('nodemailer');

const isConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
} else {
  console.warn('[Mailer] SMTP_HOST/SMTP_USER/SMTP_PASS not set in .env — emails will be logged to the console instead of sent.');
}

const FROM_ADDRESS = process.env.SMTP_FROM || `"Smart Library" <${process.env.SMTP_USER || 'no-reply@smartlibrary.local'}>`;
const LOGIN_URL = process.env.APP_LOGIN_URL || 'http://localhost:3001/login.html';

/**
 * Sends an email. Falls back to console logging if SMTP isn't configured
 * so the calling API route never has to treat "no email service" as a
 * hard failure.
 */
async function sendMail({ to, subject, html, text }) {
  if (!to) {
    console.warn('[Mailer] Skipped sending — no recipient email provided.');
    return { sent: false, reason: 'no_recipient' };
  }

  if (!transporter) {
    console.log('\n========== [Mailer] SMTP not configured — email content below ==========');
    console.log(`To: ${to}\nSubject: ${subject}\n${text || html}`);
    console.log('==========================================================================\n');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html, text });
    console.log(`[Mailer] Email sent to ${to}: "${subject}"`);
    return { sent: true };
  } catch (err) {
    console.error(`[Mailer] Failed to send email to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

function loginConfirmationEmail({ name, userId, seat }) {
  return {
    subject: 'Your Smart Library Login ID & Confirmation',
    text: `Dear ${name},\n\nYour payment was successful and your seat ${seat || ''} is confirmed.\n\nYour User ID: ${userId}\nLogin here: ${LOGIN_URL}\n\nKeep your User ID safe — you'll need it (with your full name) to sign in.\n\n— Smart Library`,
    html: `
      <div style="font-family:Poppins,Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#007cef;color:#fff;padding:20px;text-align:center;">
          <h2 style="margin:0;">Smart Library</h2>
        </div>
        <div style="padding:24px;">
          <p>Dear <strong>${name}</strong>,</p>
          <p>Your payment was successful${seat ? ` and seat <strong>${seat}</strong> is confirmed` : ''}. Here is your login information:</p>
          <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:10px;padding:16px;text-align:center;margin:16px 0;">
            <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Your User ID</span><br>
            <span style="font-size:22px;font-weight:800;color:#007cef;font-family:monospace;">${userId}</span>
          </div>
          <p style="text-align:center;">
            <a href="${LOGIN_URL}" style="background:#007cef;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Go to Login</a>
          </p>
          <p style="font-size:12px;color:#94a3b8;">Sign in using your full name and this User ID. Keep this email safe.</p>
        </div>
      </div>`
  };
}

function upgradeConfirmationEmail({ name, userId, plan, seat }) {
  return {
    subject: 'Your Smart Library Plan Has Been Upgraded',
    text: `Dear ${name},\n\nYour plan upgrade to "${plan}" is confirmed with seat ${seat || ''}.\nYour User ID remains: ${userId}\nLogin here: ${LOGIN_URL}\n\n— Smart Library`,
    html: `<p>Dear <strong>${name}</strong>,</p><p>Your plan upgrade to <strong>${plan}</strong> is confirmed${seat ? ` with seat <strong>${seat}</strong>` : ''}.</p><p>Your User ID remains: <strong>${userId}</strong></p><p><a href="${LOGIN_URL}">Go to Login</a></p>`
  };
}

function forgotIdEmail({ name, userId }) {
  return {
    subject: 'Your Smart Library User ID',
    text: `Dear ${name},\n\nAs requested, here is your registered User ID: ${userId}\nLogin here: ${LOGIN_URL}\n\nIf you did not request this, you can safely ignore this email.\n\n— Smart Library`,
    html: `
      <div style="font-family:Poppins,Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#007cef;color:#fff;padding:20px;text-align:center;"><h2 style="margin:0;">Smart Library</h2></div>
        <div style="padding:24px;">
          <p>Dear <strong>${name}</strong>,</p>
          <p>As requested, here is your registered User ID:</p>
          <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:10px;padding:16px;text-align:center;margin:16px 0;">
            <span style="font-size:22px;font-weight:800;color:#007cef;font-family:monospace;">${userId}</span>
          </div>
          <p style="text-align:center;"><a href="${LOGIN_URL}" style="background:#007cef;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Go to Login</a></p>
          <p style="font-size:12px;color:#94a3b8;">If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>`
  };
}

module.exports = { sendMail, loginConfirmationEmail, upgradeConfirmationEmail, forgotIdEmail, isConfigured };
