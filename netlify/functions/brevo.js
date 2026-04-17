// Netlify Function — Brevo CRM proxy
// Handles newsletter subscriptions and contact form captures
// Keys stored in Netlify environment variables — never in HTML
 
exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
 
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
 
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
 
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }
 
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
 
  const { email, firstName, lastName, company = '', jobTitle = '', listName = 'Newcastle_First' } = body;
  if (!email || !firstName || !lastName) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
  }
 
  const BAPI = 'https://api.brevo.com/v3';
 
  // Step 1: find list ID
  let listId = null;
  try {
    const lr = await fetch(`${BAPI}/contacts/lists?limit=50`, {
      headers: { 'api-key': apiKey, 'accept': 'application/json' }
    });
    if (lr.ok) {
      const ld = await lr.json();
      const match = (ld.lists || []).find(l =>
        l.name === listName || l.name.toLowerCase().includes('newcast')
      );
      if (match) listId = match.id;
    }
  } catch {}
 
  // Step 2: create/update contact
  const payload = {
    email,
    updateEnabled: true,
    attributes: { FIRSTNAME: firstName, LASTNAME: lastName, COMPANY: company, JOB_TITLE: jobTitle },
    listIds: listId ? [listId] : []
  };
 
  const res = await fetch(`${BAPI}/contacts`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload)
  });
 
  if (res.status === 201 || res.status === 204) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }
 
  const err = await res.json().catch(() => ({}));
 
  // Duplicate — update via PUT
  if (res.status === 400 && (err.code === 'duplicate_parameter' || (err.message || '').includes('already exist'))) {
    const put = await fetch(`${BAPI}/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ attributes: payload.attributes, listIds: payload.listIds })
    });
    if (put.ok || put.status === 204) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }
  }
 
  return { statusCode: 502, headers, body: JSON.stringify({ error: 'Brevo error', detail: err }) };
};
