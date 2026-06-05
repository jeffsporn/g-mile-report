/**
 * Run this once to get your Constant Contact access + refresh tokens.
 * Steps:
 *   1. Visit the URL printed below in your browser and log in
 *   2. Copy the `code=` value from the redirect URL
 *   3. Run: node get-token.js <code>
 */
require('dotenv').config();
const https = require('https');

const CLIENT_ID = process.env.CC_API_KEY || '954c38a8-4d7f-4af9-8721-f906d7006110';
const CLIENT_SECRET = process.env.CC_CLIENT_SECRET || 'pfShqjqKH_gUWefqEIUtmg';
const REDIRECT_URI = 'https://localhost';

const code = process.argv[2];

if (!code) {
  const authUrl =
    `https://authz.constantcontact.com/oauth2/default/v1/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=contact_data%20campaign_data` +
    `&state=leadsync123`;

  console.log('\nStep 1 — Open this URL in your browser and log in:\n');
  console.log(authUrl);
  console.log('\nStep 2 — After authorizing, copy the full redirect URL from your browser bar.');
  console.log('Step 3 — Run:  node get-token.js <code value from URL>\n');
  process.exit(0);
}

const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const body = `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

const req = https.request(
  {
    hostname: 'authz.constantcontact.com',
    path: '/oauth2/default/v1/token',
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  res => {
    let data = '';
    res.on('data', chunk => (data += chunk));
    res.on('end', () => {
      const json = JSON.parse(data);
      if (json.error) {
        console.error('\nError:', json.error_description || json.error);
        process.exit(1);
      }
      console.log('\nSuccess! Add these to your .env file:\n');
      console.log(`CC_ACCESS_TOKEN=${json.access_token}`);
      console.log(`CC_REFRESH_TOKEN=${json.refresh_token}`);
      console.log(`\nAccess token expires in ${json.expires_in} seconds (${Math.round(json.expires_in / 3600)} hours).`);
    });
  }
);

req.on('error', err => console.error('Request failed:', err.message));
req.write(body);
req.end();
