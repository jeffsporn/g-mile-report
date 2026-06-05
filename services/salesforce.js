const jsforce = require('jsforce');

let _conn = null;

async function getConnection() {
  if (_conn && _conn.accessToken) return _conn;

  _conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
  });

  await _conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );

  return _conn;
}

/**
 * Fetch leads created/modified since `since` (ISO string).
 * Returns an array of lead objects with email, name, company, etc.
 */
async function getNewLeads(since, limit = 200) {
  const conn = await getConnection();

  const sinceClause = since
    ? `WHERE CreatedDate >= ${since}`
    : '';

  const result = await conn.query(
    `SELECT Id, FirstName, LastName, Email, Company, Phone, LeadSource, Status, CreatedDate
     FROM Lead
     ${sinceClause}
     ORDER BY CreatedDate DESC
     LIMIT ${limit}`
  );

  return result.records.filter(r => r.Email); // only leads with email addresses
}

/**
 * Search leads by keyword (name, company, or email).
 */
async function searchLeads(keyword, limit = 50) {
  const conn = await getConnection();

  const escaped = keyword.replace(/'/g, "\\'");
  const result = await conn.query(
    `SELECT Id, FirstName, LastName, Email, Company, Phone, LeadSource, Status, CreatedDate
     FROM Lead
     WHERE (Name LIKE '%${escaped}%'
        OR Company LIKE '%${escaped}%'
        OR Email LIKE '%${escaped}%')
       AND Email != null
     ORDER BY CreatedDate DESC
     LIMIT ${limit}`
  );

  return result.records;
}

module.exports = { getNewLeads, searchLeads };
