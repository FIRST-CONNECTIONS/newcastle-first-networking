// Netlify Function — Airtable proxy
// Handles reading approved offers and submitting new ones
// Keys stored in Netlify environment variables — never in HTML
 
const AT_API = 'https://api.airtable.com/v0';
const AT_BASE = 'appzNaWxLuQstEUSX';
const AT_TABLE = 'tblrQUho0RGnhh03V';
 
exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
 
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
 
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Airtable token not configured' }) };
  }
 
  const atHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
 
  // ── GET — fetch approved offers for a site ──────────────────────────────
  if (event.httpMethod === 'GET') {
    const site = event.queryStringParameters?.site || 'Newcastle First';
    const filter = `AND({Approved}=1,OR(FIND("${site}",ARRAYJOIN({Site}))>0,FIND("All Sites",ARRAYJOIN({Site}))>0))`;
    const fields = [
      'Business Name','Sector','Description','Offer Headline',
      'Offer Detail','Discount Code','Website URL','Logo URL','Town / City'
    ].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
 
    const url = `${AT_API}/${AT_BASE}/${AT_TABLE}?filterByFormula=${encodeURIComponent(filter)}&${fields}&sort[0][field]=Business%20Name&sort[0][direction]=asc`;
 
    const res = await fetch(url, { headers: atHeaders });
    const data = await res.json();
 
    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Airtable fetch error', detail: data }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }
 
  // ── POST — submit a new offer ───────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
 
    const {
      businessName, sector, description, offerHeadline,
      offerDetail, discountCode, websiteUrl, logoUrl,
      town, site, contactName, contactEmail
    } = body;
 
    if (!businessName || !sector || !description || !offerHeadline || !websiteUrl || !town || !contactName || !contactEmail) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
 
    const fields = {
      'Business Name': businessName,
      'Sector': sector,
      'Description': description,
      'Offer Headline': offerHeadline,
      'Site': site || 'Newcastle First',
      'Town / City': town,
      'Contact Name': contactName,
      'Contact Email': contactEmail
    };
    if (offerDetail)   fields['Offer Detail']   = offerDetail;
    if (discountCode)  fields['Discount Code']  = discountCode;
    if (websiteUrl)    fields['Website URL']    = websiteUrl;
    if (logoUrl)       fields['Logo URL']       = logoUrl;
 
    const res = await fetch(`${AT_API}/${AT_BASE}/${AT_TABLE}`, {
      method: 'POST',
      headers: atHeaders,
      body: JSON.stringify({ fields })
    });
 
    const data = await res.json();
    if (res.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: data.id }) };
    }
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Airtable submit error', detail: data }) };
  }
 
  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
