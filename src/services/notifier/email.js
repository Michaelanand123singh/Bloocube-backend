// src/services/notifier/email.js
const nodemailer = require('nodemailer');
const config = require('../../config/env');
const logger = require('../../utils/logger');

let transporter;

function getTransporter() {
  if (!transporter) {
    const hasCreds = !!(config.EMAIL_USER && config.EMAIL_PASS);
    const isProd = config.NODE_ENV === 'production';

    if (!hasCreds && !isProd) {
      // Development fallback: log emails instead of sending
      logger.warn('Email credentials missing - using JSON transport (dev fallback)');
      transporter = nodemailer.createTransport({ jsonTransport: true });
    } else {
      const secure = Number(config.EMAIL_PORT) === 465; // true for port 465
      transporter = nodemailer.createTransport({
        host: config.EMAIL_HOST,
        port: Number(config.EMAIL_PORT),
        secure,
        auth: hasCreds ? {
          user: config.EMAIL_USER,
          pass: config.EMAIL_PASS
        } : undefined
      });
    }
  }
  return transporter;
}

async function sendMail(to, subject, html) {
  const t = getTransporter();
  const info = await t.sendMail({
    from: config.EMAIL_FROM,
    to,
    subject,
    html
  });
  logger.info('Email sent (or logged)', { messageId: info.messageId, to });
  return info;
}
async function sendPasswordResetEmail(to, resetUrl) {
  const t = getTransporter();
  const mailOptions = {
    from: config.EMAIL_FROM,
    to,
    subject: 'Reset your password',
    html: `<p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password. If you did not request this, ignore this email.</p>`
  };
  await t.sendMail(mailOptions);
}

async function sendVerificationEmail(to, verifyUrl) {
  const t = getTransporter();
  const mailOptions = {
    from: config.EMAIL_FROM,
    to,
    subject: 'Verify your email address',
    html: `<p>Welcome to Bloocube!</p>
           <p>Please verify your email by clicking <a href="${verifyUrl}">this link</a>.</p>
           <p>If you did not create an account, you can ignore this email.</p>`
  };
  await t.sendMail(mailOptions);
}

async function sendOTPEmail(to, otpCode) {
  const t = getTransporter();
  const mailOptions = {
    from: config.EMAIL_FROM,
    to,
    subject: 'Your Bloocube Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Bloocube</h1>
          <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Your verification code</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Complete Your Registration</h2>
          <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
            Thank you for signing up with Bloocube! To complete your registration, please use the verification code below:
          </p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
            <div style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; font-family: 'Courier New', monospace;">
              ${otpCode}
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
            This code will expire in <strong>10 minutes</strong>. If you didn't request this code, please ignore this email.
          </p>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `
  };
  await t.sendMail(mailOptions);
}

module.exports = { sendMail, sendPasswordResetEmail, sendVerificationEmail, sendOTPEmail };


