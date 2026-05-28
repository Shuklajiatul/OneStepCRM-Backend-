/**
 * jobs/emailQueue.js
 * ─────────────────────────────────────────────────────────
 * Bull queue for async email sending.
 * Phase 1: Console transport (logs to console).
 * Production: Replace with SMTP/SendGrid/SES transporter.
 */

const { createQueue } = require('../config/queue');
const config = require('../config/environment');

// Create the email queue
const emailQueue = createQueue('email');

/**
 * Process email jobs.
 * In Phase 1, we log to console instead of actually sending emails.
 */
emailQueue.process(async (job) => {
  const { to, subject, body, template, data } = job.data;

  console.log('═══════════════════════════════════════════════');
  console.log('  📧 EMAIL SENT (Console Transport)');
  console.log('═══════════════════════════════════════════════');
  console.log(`  To:       ${to}`);
  console.log(`  Subject:  ${subject}`);
  console.log(`  Template: ${template || 'plain'}`);
  if (body) {
    console.log(`  Body:     ${body.substring(0, 200)}`);
  }
  if (data) {
    console.log(`  Data:     ${JSON.stringify(data)}`);
  }
  console.log('═══════════════════════════════════════════════\n');

  return { delivered: true, transport: 'console' };
});

/**
 * Enqueue a welcome email for new tenant registration.
 * @param {string} to - Recipient email
 * @param {string} name - User name
 * @param {string} companyName - Tenant company name
 */
async function sendWelcomeEmail(to, name, companyName) {
  await emailQueue.add('welcome', {
    to,
    subject: `Welcome to OneStepCRM, ${name}!`,
    template: 'welcome',
    body: `Hi ${name},\n\nWelcome to OneStepCRM! Your account for ${companyName} has been created successfully.\n\nGet started by logging in and setting up your pipeline.\n\nBest,\nThe OneStepCRM Team`,
    data: { name, companyName },
  });
}

/**
 * Enqueue an invitation email for a new team member.
 * @param {string} to - Recipient email
 * @param {string} inviterName - Name of user who sent the invite
 * @param {string} companyName - Tenant company name
 * @param {string} inviteToken - Invitation token
 */
async function sendInviteEmail(to, inviterName, companyName, inviteToken) {
  const inviteUrl = `${config.frontendUrl}/invite?token=${inviteToken}`;
  await emailQueue.add('invite', {
    to,
    subject: `${inviterName} invited you to join ${companyName} on OneStepCRM`,
    template: 'invite',
    body: `Hi,\n\n${inviterName} has invited you to join ${companyName} on OneStepCRM.\n\nClick the link below to accept the invitation:\n${inviteUrl}\n\nThis link expires in 48 hours.\n\nBest,\nThe OneStepCRM Team`,
    data: { inviterName, companyName, inviteUrl },
  });
}

/**
 * Enqueue a password reset email.
 * @param {string} to - Recipient email
 * @param {string} name - User name
 * @param {string} resetToken - Password reset token
 */
async function sendPasswordResetEmail(to, name, resetToken) {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
  await emailQueue.add('password-reset', {
    to,
    subject: 'Reset your OneStepCRM password',
    template: 'password-reset',
    body: `Hi ${name},\n\nWe received a request to reset your password.\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.\n\nBest,\nThe OneStepCRM Team`,
    data: { name, resetUrl },
  });
}

module.exports = {
  emailQueue,
  sendWelcomeEmail,
  sendInviteEmail,
  sendPasswordResetEmail,
};
