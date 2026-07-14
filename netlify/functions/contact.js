// Netlify Function — Contact form (transactional email via Brevo)
//
// Handles both the standard Contact page form and the Grants &
// Funding (funding-support) form. Sends a formatted transactional
// email to the team inbox via Brevo's /v3/smtp/email endpoint, and
// also captures the contact into the Brevo mailing list so future
// newsletters reach them.
//
// Required env vars (set in Netlify → Site settings → Env vars):
//   BREVO_API_KEY       — same key already used by brevo.js
// Optional:
//   CONTACT_TO_EMAIL    — inbox to receive enquiries (default: hello@first-connections.co.uk)
//   CONTACT_FROM_EMAIL  — verified Brevo sender identity (default: same as CONTACT_TO_EMAIL)
//   CONTACT_FROM_NAME   — display name on outbound emails (default: "Newcastle First website")
//   BREVO_LIST_ID       — mailing-list id (default: 6, same as brevo.js)

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'BREVO_API_KEY not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const {
    name         = '',
    email        = '',
    subject      = 'General Enquiry',
    message      = '',
    businessName = '',
    phone        = '',
    interest     = '',
    stage        = '',
    formType     = 'contact'
  } = body;

  if (!String(name).trim() || !String(email).trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name and email are required' }) };
  }

  const toEmail   = process.env.CONTACT_TO_EMAIL   || 'hello@first-connections.co.uk';
  const fromEmail = process.env.CONTACT_FROM_EMAIL || toEmail;
  const fromName  = process.env.CONTACT_FROM_NAME  || 'Newcastle First website';
  const listId    = Number(process.env.BREVO_LIST_ID) || 6;

  const isFunding = formType === 'funding-support';
  const prefix    = isFunding ? 'Grants & Funding' : 'Contact form';
  const emailSubject = `${prefix}: ${subject}${businessName ? ' — ' + businessName : ''}`;

  const rows = [
    ['Name',      name],
    ['Email',     email],
    ['Business',  businessName],
    ['Phone',     phone],
    ['Interest',  interest],
    ['Stage',     stage],
    ['Subject',   subject]
  ].filter(([, v]) => v);

  const htmlBody = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#1c1c2e;">
      <h2 style="color:#1a2550;margin:0 0 16px;">${escapeHtml(prefix)} enquiry</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
        ${rows.map(([k, v]) => `
          <tr>
            <td style="padding:6px 10px 6px 0;color:#5a5a78;vertical-align:top;width:110px;">${escapeHtml(k)}</td>
            <td style="padding:6px 0;">${k === 'Email' ? `<a href="mailto:${escapeHtml(v)}">${escapeHtml(v)}</a>` : `<strong>${escapeHtml(v)}</strong>`}</td>
          </tr>
        `).join('')}
      </table>
      <div style="border-top:1px solid #dde1eb;padding-top:16px;">
        <div style="color:#5a5a78;margin-bottom:6px;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Message</div>
        <div style="white-space:pre-wrap;line-height:1.6;">${escapeHtml(message || '(no message provided)')}</div>
      </div>
      <p style="font-size:12px;color:#8a8a9c;margin-top:24px;">Sent from newcastlefirst.network on ${new Date().toISOString()}. Reply directly to reach the sender.</p>
    </div>
  `;

  const textBody =
    `${prefix} enquiry\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nMessage:\n${message || '(no message provided)'}\n`;

  // Send transactional email via Brevo
  let emailOk = false;
  let emailErr = null;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender:  { email: fromEmail, name: fromName },
        to:      [{ email: toEmail }],
        replyTo: { email, name: name || undefined },
        subject: emailSubject,
        htmlContent: htmlBody,
        textContent: textBody
      })
    });
    emailOk = res.status === 201 || res.status === 200;
    if (!emailOk) emailErr = await res.json().catch(() => ({ status: res.status }));
  } catch (e) {
    emailErr = { error: String(e && e.message || e) };
  }

  // Fire-and-forget: add contact to the mailing list (same behaviour as brevo.js).
  // We deliberately don't await this — a slow Brevo list op shouldn't hold the user.
  const parts = String(name).trim().split(/\s+/);
  fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      updateEnabled: true,
      attributes: {
        FIRSTNAME: parts[0] || name,
        LASTNAME:  parts.slice(1).join(' ') || '-',
        COMPANY:   businessName || '',
        JOB_TITLE: isFunding ? 'Funding enquiry' : 'Contact enquiry'
      },
      listIds: [listId]
    })
  }).catch(() => {});

  if (emailOk) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }
  return { statusCode: 502, headers, body: JSON.stringify({ error: 'Email send failed', detail: emailErr }) };
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
