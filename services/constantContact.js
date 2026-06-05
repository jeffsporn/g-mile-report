const axios = require('axios');

const BASE_URL = 'https://api.cc.email/v3';

function client() {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${process.env.CC_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Upsert a contact from a Salesforce lead object.
 * Returns the Constant Contact contact id.
 */
async function upsertContact(lead, listIds = []) {
  const targetLists = listIds.length > 0
    ? listIds
    : process.env.CC_DEFAULT_LIST_ID
      ? [process.env.CC_DEFAULT_LIST_ID]
      : [];

  const payload = {
    email_address: {
      address: lead.Email,
      permission_to_send: 'implicit',
    },
    first_name: lead.FirstName || '',
    last_name: lead.LastName || '',
    company_name: lead.Company || '',
    phone_numbers: lead.Phone
      ? [{ phone_number: lead.Phone, kind: 'work' }]
      : [],
    list_memberships: targetLists,
    custom_fields: [
      { custom_field_id: 'lead_source', value: lead.LeadSource || '' },
      { custom_field_id: 'sf_lead_id', value: lead.Id || '' },
    ].filter(f => f.value),
  };

  const http = client();

  // PUT /contacts/sign_up_form upserts by email
  const response = await http.put('/contacts/sign_up_form', payload);
  return response.data;
}

async function getLists() {
  const http = client();
  const response = await http.get('/contact_lists', {
    params: { limit: 50, include_count: true },
  });
  return response.data.lists || [];
}

async function createList(name) {
  const http = client();
  const response = await http.post('/contact_lists', {
    name,
    favorite: false,
  });
  return response.data;
}

/**
 * Create a simple email campaign and schedule it immediately (or at a given time).
 * subject, htmlBody, fromEmail, fromName are required.
 * scheduledTime defaults to "now + 5 min" if omitted.
 */
async function createAndScheduleCampaign({
  name,
  subject,
  htmlBody,
  fromEmail,
  fromName,
  listIds = [],
  scheduledTime,
}) {
  const http = client();
  const targetLists = listIds.length > 0
    ? listIds
    : process.env.CC_DEFAULT_LIST_ID
      ? [process.env.CC_DEFAULT_LIST_ID]
      : [];

  // 1. Create campaign activity
  const activityRes = await http.post('/emails', {
    name,
    email_campaign_activities: [
      {
        format_type: 5, // custom code
        from_email: fromEmail,
        from_name: fromName,
        reply_to_email: fromEmail,
        subject,
        html_content: htmlBody,
        contact_list_ids: targetLists,
      },
    ],
  });

  const campaignId = activityRes.data.campaign_id;
  const activityId = activityRes.data.campaign_activities[0].campaign_activity_id;

  // 2. Schedule it
  const sendAt = scheduledTime || new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await http.post(`/emails/activities/${activityId}/schedules`, {
    scheduled_date: sendAt,
  });

  return { campaignId, activityId, scheduledAt: sendAt };
}

module.exports = { upsertContact, getLists, createList, createAndScheduleCampaign };
