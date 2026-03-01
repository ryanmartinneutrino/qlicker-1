import nodemailer from 'nodemailer';
import config from '../config/index.js';

let transporter = null;

function parseMailUrl(mailUrl) {
  if (!mailUrl) return null;
  try {
    const url = new URL(mailUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port, 10) || 587,
      secure: url.port === '465',
      auth: url.username
        ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password || '') }
        : undefined,
    };
  } catch (err) {
    console.warn('Failed to parse MAIL_URL:', err.message);
    return null;
  }
}

function getTransporter() {
  if (transporter) return transporter;
  const smtpConfig = parseMailUrl(config.mailUrl);
  if (!smtpConfig) {
    console.warn('MAIL_URL not configured – emails will not be sent');
    return null;
  }
  transporter = nodemailer.createTransport(smtpConfig);
  return transporter;
}

export async function sendVerificationEmail(user, token) {
  const t = getTransporter();
  if (!t) {
    console.warn('Email transport not available, skipping verification email');
    return;
  }
  const verifyUrl = `${config.rootUrl}/verify-email/${token}`;
  const emailAddress = user.emails?.[0]?.address;
  await t.sendMail({
    from: config.mailUrl ? undefined : 'noreply@qlicker.app',
    to: emailAddress,
    subject: 'Verify your Qlicker email',
    html: `<p>Hello ${user.profile?.firstname || ''},</p>
<p>Please verify your email by clicking the link below:</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  });
}

export async function sendPasswordResetEmail(user, token) {
  const t = getTransporter();
  if (!t) {
    console.warn('Email transport not available, skipping password reset email');
    return;
  }
  const resetUrl = `${config.rootUrl}/reset-password/${token}`;
  const emailAddress = user.emails?.[0]?.address;
  await t.sendMail({
    from: config.mailUrl ? undefined : 'noreply@qlicker.app',
    to: emailAddress,
    subject: 'Reset your Qlicker password',
    html: `<p>Hello ${user.profile?.firstname || ''},</p>
<p>You requested a password reset. Click the link below to set a new password:</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>If you did not request this, please ignore this email.</p>`,
  });
}
