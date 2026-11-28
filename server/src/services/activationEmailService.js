const mailService = require('./mailService');
const settingsService = require('./settingsService');
const { appUrl } = require('../utils/url');

const TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

function formatIST(date) {
  if (!date) return '';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Base email layout wrapper following Analytics Avenue theme:
 * Deep Navy: #101827, Electric Blue: #4361EE, Light Grey: #F8FAFC, Dark Slate: #1E293B
 */
function wrapEmailTemplate({ title, heading, subtitle, contentHtml, footerNote }) {
  const deepNavy = '#101827';
  const electricBlue = '#4361EE';
  const lightGrey = '#F8FAFC';
  const slateText = '#1E293B';
  const mutedText = '#64748B';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${lightGrey};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${slateText};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${lightGrey};padding:30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0">
          <!-- Header Bar -->
          <tr>
            <td style="background:${deepNavy};padding:24px 30px;border-bottom:3px solid ${electricBlue};">
              <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">Analytics Avenue</h2>
              <p style="margin:4px 0 0 0;color:#94A3B8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Security & Course Activation</p>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding:32px 30px;">
              <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:${deepNavy};">${escapeHtml(heading)}</h1>
              ${subtitle ? `<p style="margin:0 0 24px 0;font-size:14px;color:${mutedText};">${escapeHtml(subtitle)}</p>` : ''}
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F1F5F9;padding:20px 30px;border-top:1px solid #E2E8F0;text-align:center;">
              <p style="margin:0;font-size:12px;color:${mutedText};">
                ${footerNote || 'This is an automated notification from Analytics Avenue LMS. If you did not request this, please contact support immediately.'}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends one-time PIN email to student upon admin authorization
 */
async function sendActivationPinEmail({ studentName, email, pin, expiresAt, courses = [] }) {
  const url = `${appUrl()}/activate`;
  const courseListHtml = courses.length
    ? `<div style="margin:16px 0;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 16px;">
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#1E293B;text-transform:uppercase;letter-spacing:0.5px;">Authorized Courses:</p>
        <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.6;">
          ${courses.map((c) => `<li><strong>${escapeHtml(c.title || c)}</strong></li>`).join('')}
        </ul>
      </div>`
    : '';

  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">Dear <strong>${escapeHtml(studentName)}</strong>,</p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">
      Your payment has been verified by the administrator, and course authorization is ready. Use the 4-digit activation PIN below to activate your LMS access on your first device.
    </p>

    <!-- 4-Digit PIN Showcase Card -->
    <div style="margin:24px 0;text-align:center;background:#F0F4FF;border:2px dashed #4361EE;border-radius:12px;padding:20px;">
      <span style="font-size:12px;font-weight:700;color:#4361EE;text-transform:uppercase;letter-spacing:1.5px;display:block;margin-bottom:8px;">Your 4-Digit Activation PIN</span>
      <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#101827;font-family:monospace;margin:4px 0;">
        ${escapeHtml(pin)}
      </div>
      <span style="font-size:12px;color:#64748B;display:block;margin-top:8px;">
        Valid until: <strong>${escapeHtml(formatIST(expiresAt))}</strong>
      </span>
    </div>

    ${courseListHtml}

    <!-- Security Warning Box -->
    <div style="margin:20px 0;background:#FFFBEB;border-left:4px solid #F59E0B;padding:14px 16px;border-radius:0 8px 8px 0;">
      <p style="margin:0;font-size:13px;line-height:1.5;color:#92400E;">
        <strong>Important Device Binding Rule:</strong> This PIN can be used <strong>only once for first-time activation</strong> on your chosen device (System A). Once activated, the LMS is permanently bound to that device. You will NOT be able to use this PIN on another computer or browser.
      </p>
    </div>

    <!-- Activation CTA Button -->
    <div style="margin:28px 0 16px 0;text-align:center;">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#4361EE;color:#ffffff;padding:14px 28px;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;box-shadow:0 4px 6px rgba(67,97,238,0.25);">
        Activate LMS on This Device &rarr;
      </a>
    </div>
    <p style="margin:16px 0 0 0;font-size:13px;color:#64748B;text-align:center;">
      Direct link: <a href="${escapeHtml(url)}" style="color:#4361EE;">${escapeHtml(url)}</a>
    </p>
  `;

  const html = wrapEmailTemplate({
    title: 'Your 4-Digit LMS Course Activation PIN',
    heading: 'Your Course Access is Authorized',
    subtitle: 'Complete first-time device activation to start learning',
    contentHtml,
  });

  const courseNames = courses.map((c) => c.title || c).join(', ');
  const text = `Hi ${studentName},

Your payment has been verified and course access is authorized.

Your 4-digit One-Time Activation PIN is: ${pin}
Valid until: ${formatIST(expiresAt)}

Authorized Courses:
${courseNames}

IMPORTANT: This PIN is for ONE-TIME first device activation only. Once activated on your primary device, it cannot be used on another system.

Activate your device here:
${url}

Analytics Avenue LMS`;

  return await mailService.sendMail({
    to: email,
    subject: 'Your 4-Digit LMS Course Activation PIN - Analytics Avenue',
    text,
    html,
  });
}

/**
 * Sends notification when device activation is reset by Admin
 */
async function sendActivationResetEmail({ studentName, email, newPin, expiresAt, courses = [] }) {
  if (newPin) {
    return await sendActivationPinEmail({ studentName, email, pin: newPin, expiresAt, courses });
  }

  const url = `${appUrl()}/activate`;
  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">Dear <strong>${escapeHtml(studentName)}</strong>,</p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">
      Your device activation for Analytics Avenue LMS has been reset by the administrator. Previous device bindings have been cleared.
    </p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">
      Please contact the administrator or check your email for a new activation PIN to activate your new device.
    </p>
  `;

  const html = wrapEmailTemplate({
    title: 'LMS Device Activation Reset',
    heading: 'Device Activation Reset by Administrator',
    contentHtml,
  });

  return await mailService.sendMail({
    to: email,
    subject: 'LMS Device Activation Reset - Analytics Avenue',
    text: `Hi ${studentName},\n\nYour LMS device activation has been reset by the administrator.\n\nAnalytics Avenue LMS`,
    html,
  });
}

/**
 * Sends notification when device activation is revoked by Admin
 */
async function sendActivationRevokedEmail({ studentName, email, reason }) {
  const contentHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">Dear <strong>${escapeHtml(studentName)}</strong>,</p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">
      Your course device activation has been revoked by the administrator.
    </p>
    ${reason ? `<p style="margin:0 0 16px 0;font-size:14px;color:#B91C1C;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
    <p style="margin:0 0 16px 0;font-size:14px;color:#64748B;">
      If you believe this is in error, please contact support.
    </p>
  `;

  const html = wrapEmailTemplate({
    title: 'Course Activation Revoked',
    heading: 'Course Activation Revoked',
    contentHtml,
  });

  return await mailService.sendMail({
    to: email,
    subject: 'Course Activation Revoked - Analytics Avenue',
    text: `Hi ${studentName},\n\nYour course activation has been revoked.\nReason: ${reason || 'N/A'}\n\nAnalytics Avenue LMS`,
    html,
  });
}

module.exports = {
  sendActivationPinEmail,
  sendActivationResetEmail,
  sendActivationRevokedEmail,
  formatIST,
};
