const mailService = require('./mailService');
const settingsService = require('./settingsService');
const TicketNotification = require('../models/TicketNotification');
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

const STATUS_LABELS = {
  open: 'Open',
  under_review: 'Under Review',
  awaiting_student_response: 'Awaiting Student Response',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS = {
  open: '#2563eb',
  under_review: '#d97706',
  awaiting_student_response: '#7c3aed',
  resolved: '#16a34a',
  closed: '#475569',
};

/** Resolves the company support recipient dynamically from settings/env. */
async function resolveSupportEmail() {
  const { branding, email } = await settingsService.get();
  return (
    branding.supportEmail ||
    process.env.SUPPORT_EMAIL ||
    process.env.RESEND_FROM ||
    email.fromEmail ||
    'support@analyticsavenuerd.in'
  );
}

/**
 * Base email layout wrapper following Analytics Avenue LMS theme
 */
function wrapHtmlTemplate({ title, heading, badgeText, badgeColor, contentHtml, ctaText, ctaLink, footerNote }) {
  const deepNavy = '#101827';
  const electricBlue = '#4361EE';
  const lightGrey = '#F8FAFC';
  const slateText = '#1E293B';
  const mutedText = '#64748B';

  return `
<!DOCTYPE html>
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">Analytics Avenue</h2>
                    <p style="margin:4px 0 0 0;color:#94A3B8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Learner Support Desk</p>
                  </td>
                  ${badgeText ? `
                  <td align="right">
                    <span style="display:inline-block;padding:6px 12px;background:${badgeColor || electricBlue};color:#ffffff;font-size:12px;font-weight:600;border-radius:20px;">
                      ${escapeHtml(badgeText)}
                    </span>
                  </td>` : ''}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:32px 30px 24px 30px;">
              <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:${deepNavy};line-height:1.4;">
                ${escapeHtml(heading)}
              </h1>
              ${contentHtml}

              ${ctaText && ctaLink ? `
              <div style="margin:28px 0 10px 0;text-align:center;">
                <a href="${escapeHtml(ctaLink)}" target="_blank" style="display:inline-block;padding:12px 28px;background:${electricBlue};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;box-shadow:0 2px 4px rgba(67,97,238,0.25);">
                  ${escapeHtml(ctaText)} &rarr;
                </a>
              </div>` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F1F5F9;padding:20px 30px;border-top:1px solid #E2E8F0;color:${mutedText};font-size:12px;line-height:1.6;">
              <p style="margin:0;">${footerNote || 'This is an automated notification from Analytics Avenue Support System.'}</p>
              <p style="margin:6px 0 0 0;color:#94A3B8;">&copy; ${new Date().getFullYear()} Analytics Avenue. All rights reserved.</p>
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
 * Record notification log safely in MongoDB
 */
async function recordNotificationLog({
  ticketId,
  ticketObjectId,
  notificationType,
  recipient,
  recipientRole,
  subject,
  deliveryStatus,
  provider,
  errorDetails,
}) {
  try {
    await TicketNotification.create({
      ticketId,
      ticketObjectId,
      notificationType,
      recipient,
      recipientRole,
      subject,
      deliveryStatus,
      provider: provider || '',
      sentAt: new Date(),
      errorDetails: errorDetails || '',
    });
  } catch (err) {
    console.error('[TicketNotification] Failed to record log:', err.message);
  }
}

/**
 * Email 1: New Ticket Submitted
 * Sent to the configured company support email
 */
async function sendNewTicketAdminNotification(ticket) {
  const supportEmail = await resolveSupportEmail();
  const subject = `New Support Ticket Submitted – [${ticket.ticketId}]`;
  const reviewLink = `${appUrl()}/admin/tickets/${ticket._id}`;
  const submittedTime = formatIST(ticket.createdAt || new Date());

  const detailsRows = [
    ['Ticket ID', ticket.ticketId],
    ['Student Name', ticket.studentName],
    ['Student Email', ticket.studentEmail],
    ['Technology', ticket.technology],
    ['Submitted On', submittedTime],
  ];

  const text = [
    `New Support Ticket Submitted – [${ticket.ticketId}]`,
    '',
    ...detailsRows.map(([lbl, val]) => `${lbl}: ${val}`),
    '',
    'Issue Description:',
    ticket.issueDescription,
    '',
    `Proof (Google Drive): ${ticket.proofDriveLink}`,
    '',
    `Review Ticket in Admin LMS: ${reviewLink}`,
  ].join('\n');

  const rowsHtml = detailsRows
    .map(
      ([label, val]) => `
      <tr>
        <td style="padding:7px 12px;color:#64748B;font-size:13px;font-weight:500;width:140px;background:#F8FAFC;border:1px solid #E2E8F0;">${escapeHtml(label)}</td>
        <td style="padding:7px 12px;color:#0F172A;font-size:13px;font-weight:600;border:1px solid #E2E8F0;">${escapeHtml(val)}</td>
      </tr>`
    )
    .join('');

  const contentHtml = `
    <p style="font-size:14px;color:#334155;margin:0 0 16px 0;">
      A student has submitted a new support ticket that requires review.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:20px;">
      ${rowsHtml}
    </table>
    <div style="background:#F8FAFC;border-left:4px solid #4361EE;padding:14px 16px;border-radius:4px;margin-bottom:20px;">
      <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#1E293B;text-transform:uppercase;letter-spacing:0.5px;">Issue Description</h3>
      <p style="margin:0;font-size:14px;color:#334155;white-space:pre-wrap;line-height:1.5;">${escapeHtml(ticket.issueDescription)}</p>
    </div>
    <div style="background:#EFF6FF;border:1px solid #BFDBFE;padding:12px 16px;border-radius:6px;margin-bottom:20px;">
      <span style="font-size:13px;font-weight:600;color:#1D4ED8;">Attached Proof (Google Drive):</span><br>
      <a href="${escapeHtml(ticket.proofDriveLink)}" target="_blank" style="color:#2563EB;font-size:13px;word-break:break-all;text-decoration:underline;">
        ${escapeHtml(ticket.proofDriveLink)}
      </a>
    </div>`;

  const html = wrapHtmlTemplate({
    title: subject,
    heading: `New Support Ticket from ${ticket.studentName}`,
    badgeText: ticket.technology,
    badgeColor: '#4361EE',
    contentHtml,
    ctaText: 'Open Ticket in Admin LMS',
    ctaLink: reviewLink,
    footerNote: 'You received this email because you are configured as the support/admin recipient for Analytics Avenue.',
  });

  const res = await mailService.sendMail({ to: supportEmail, subject, text, html });
  await recordNotificationLog({
    ticketId: ticket.ticketId,
    ticketObjectId: ticket._id,
    notificationType: 'ticket_created',
    recipient: supportEmail,
    recipientRole: 'company_support',
    subject,
    deliveryStatus: res.sent ? 'sent' : 'failed',
    provider: res.provider,
    errorDetails: res.error,
  });

  return res;
}

/**
 * Email 2: Admin Reply
 * Sent to the student's registered email address
 */
async function sendAdminReplyNotification(ticket, replyMessage, adminName = 'Support Team') {
  const studentEmail = ticket.studentEmail;
  const subject = `Update on Your Support Ticket – [${ticket.ticketId}]`;
  const ticketLink = `${appUrl()}/my-tickets/${ticket._id}`;
  const statusLabel = STATUS_LABELS[ticket.status] || ticket.status;
  const replyTime = formatIST(new Date());

  const text = [
    `Hi ${ticket.studentName},`,
    '',
    `Our support team has responded to your ticket [${ticket.ticketId}] regarding ${ticket.technology}.`,
    '',
    `Current Status: ${statusLabel}`,
    `Updated On: ${replyTime}`,
    '',
    'Admin Response:',
    replyMessage,
    '',
    `View and reply to your ticket here: ${ticketLink}`,
    '',
    'Best regards,',
    'Analytics Avenue Support Team',
  ].join('\n');

  const contentHtml = `
    <p style="font-size:15px;color:#334155;margin:0 0 16px 0;">
      Hi <strong>${escapeHtml(ticket.studentName)}</strong>,
    </p>
    <p style="font-size:14px;color:#334155;margin:0 0 16px 0;line-height:1.5;">
      Our support team has provided a response to your support ticket regarding <strong>${escapeHtml(ticket.technology)}</strong>.
    </p>
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;margin-bottom:8px;">
        Response from ${escapeHtml(adminName)} &bull; ${escapeHtml(replyTime)}
      </div>
      <div style="font-size:14px;color:#0F172A;white-space:pre-wrap;line-height:1.6;">
        ${escapeHtml(replyMessage)}
      </div>
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;font-size:13px;">
      <tr>
        <td style="color:#64748B;padding:4px 0;">Ticket ID:</td>
        <td style="font-weight:600;color:#0F172A;padding:4px 0;">${escapeHtml(ticket.ticketId)}</td>
      </tr>
      <tr>
        <td style="color:#64748B;padding:4px 0;">Current Status:</td>
        <td style="font-weight:600;color:${STATUS_COLORS[ticket.status] || '#4361EE'};padding:4px 0;">
          ${escapeHtml(statusLabel)}
        </td>
      </tr>
    </table>`;

  const html = wrapHtmlTemplate({
    title: subject,
    heading: 'New Response on Your Support Ticket',
    badgeText: statusLabel,
    badgeColor: STATUS_COLORS[ticket.status] || '#4361EE',
    contentHtml,
    ctaText: 'View Ticket & Conversation',
    ctaLink: ticketLink,
    footerNote: 'If you have additional information to provide, please reply directly inside your My Tickets dashboard.',
  });

  const res = await mailService.sendMail({ to: studentEmail, subject, text, html });
  await recordNotificationLog({
    ticketId: ticket.ticketId,
    ticketObjectId: ticket._id,
    notificationType: 'admin_reply',
    recipient: studentEmail,
    recipientRole: 'student',
    subject,
    deliveryStatus: res.sent ? 'sent' : 'failed',
    provider: res.provider,
    errorDetails: res.error,
  });

  return res;
}

/**
 * Email 3: Ticket Status Updates
 * Sent to the student when ticket status changes
 */
async function sendStatusUpdateNotification(ticket, newStatus, note = '') {
  const studentEmail = ticket.studentEmail;
  const statusLabel = STATUS_LABELS[newStatus] || newStatus;
  const subject = `Status Update on Ticket [${ticket.ticketId}] – ${statusLabel}`;
  const ticketLink = `${appUrl()}/my-tickets/${ticket._id}`;
  const updateTime = formatIST(new Date());

  let statusExplanation = '';
  switch (newStatus) {
    case 'under_review':
      statusExplanation = 'Our technical and academic mentors are actively investigating your query and reviewing the proof provided.';
      break;
    case 'awaiting_student_response':
      statusExplanation = 'We require some additional clarification or details from you to proceed. Please check the conversation history and reply.';
      break;
    case 'resolved':
      statusExplanation = 'Your issue has been marked as resolved. If you require further assistance or the issue persists, you can reply directly in the ticket.';
      break;
    case 'closed':
      statusExplanation = 'This support ticket has been closed. Thank you for reaching out to Analytics Avenue Support.';
      break;
    default:
      statusExplanation = `Your ticket status has been updated to ${statusLabel}.`;
  }

  const text = [
    `Hi ${ticket.studentName},`,
    '',
    `Your support ticket [${ticket.ticketId}] status has been updated to: ${statusLabel}.`,
    '',
    statusExplanation,
    ...(note ? ['', `Note from Admin: ${note}`] : []),
    '',
    `Updated On: ${updateTime}`,
    '',
    `View Ticket Details: ${ticketLink}`,
    '',
    'Best regards,',
    'Analytics Avenue Support Team',
  ].join('\n');

  const contentHtml = `
    <p style="font-size:15px;color:#334155;margin:0 0 16px 0;">
      Hi <strong>${escapeHtml(ticket.studentName)}</strong>,
    </p>
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin-bottom:20px;text-align:center;">
      <span style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">
        New Ticket Status
      </span>
      <span style="display:inline-block;padding:6px 16px;background:${STATUS_COLORS[newStatus] || '#4361EE'};color:#ffffff;font-size:14px;font-weight:700;border-radius:20px;">
        ${escapeHtml(statusLabel)}
      </span>
      <p style="margin:14px 0 0 0;font-size:14px;color:#334155;line-height:1.5;">
        ${escapeHtml(statusExplanation)}
      </p>
      ${note ? `
      <div style="margin-top:12px;padding-top:12px;border-top:1px dashed #CBD5E1;font-size:13px;color:#475569;font-style:italic;">
        &ldquo;${escapeHtml(note)}&rdquo;
      </div>` : ''}
    </div>`;

  const html = wrapHtmlTemplate({
    title: subject,
    heading: `Ticket Status Updated: ${statusLabel}`,
    badgeText: ticket.technology,
    badgeColor: '#4361EE',
    contentHtml,
    ctaText: 'Open Ticket in LMS',
    ctaLink: ticketLink,
    footerNote: 'You received this notification because of an update on your support ticket.',
  });

  const res = await mailService.sendMail({ to: studentEmail, subject, text, html });
  await recordNotificationLog({
    ticketId: ticket.ticketId,
    ticketObjectId: ticket._id,
    notificationType: 'status_updated',
    recipient: studentEmail,
    recipientRole: 'student',
    subject,
    deliveryStatus: res.sent ? 'sent' : 'failed',
    provider: res.provider,
    errorDetails: res.error,
  });

  return res;
}

module.exports = {
  sendNewTicketAdminNotification,
  sendAdminReplyNotification,
  sendStatusUpdateNotification,
  STATUS_LABELS,
};

