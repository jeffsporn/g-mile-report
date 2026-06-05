const { App } = require('@slack/bolt');
const sf = require('../services/salesforce');
const cc = require('../services/constantContact');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false, // using HTTP; set to true + add appToken for Socket Mode
});

// /sync-leads [since:<ISO_DATE>] [list:<CC_LIST_ID>]
// e.g.  /sync-leads since:2026-06-01
//       /sync-leads list:abc123def
app.command('/sync-leads', async ({ command, ack, respond }) => {
  await ack();

  const args = parseArgs(command.text);
  const since = args.since || null;
  const listIds = args.list ? [args.list] : [];

  await respond({ text: `Fetching leads from Salesforce${since ? ` since ${since}` : ''}…` });

  try {
    const leads = await sf.getNewLeads(since);
    if (leads.length === 0) {
      return respond({ text: 'No new leads found in Salesforce.' });
    }

    await respond({ text: `Found *${leads.length}* lead(s). Syncing to Constant Contact…` });

    const results = await Promise.allSettled(
      leads.map(lead => cc.upsertContact(lead, listIds))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    await respond({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:white_check_mark: Sync complete: *${succeeded}* contact(s) added/updated in Constant Contact.${failed > 0 ? `\n:warning: ${failed} failed — check server logs.` : ''}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: leads
                .slice(0, 10)
                .map(l => `• ${l.FirstName || ''} ${l.LastName || ''} <${l.Email}> — ${l.Company || 'N/A'}`)
                .join('\n') + (leads.length > 10 ? `\n_…and ${leads.length - 10} more_` : ''),
            },
          ],
        },
      ],
    });
  } catch (err) {
    await respond({ text: `:x: Error: ${err.message}` });
  }
});

// /search-leads <keyword>
app.command('/search-leads', async ({ command, ack, respond }) => {
  await ack();

  const keyword = command.text.trim();
  if (!keyword) {
    return respond({ text: 'Usage: `/search-leads <name, email, or company>`' });
  }

  try {
    const leads = await sf.searchLeads(keyword);
    if (leads.length === 0) {
      return respond({ text: `No leads found matching "${keyword}".` });
    }

    const rows = leads.map(
      l =>
        `• *${l.FirstName || ''} ${l.LastName || ''}* | ${l.Email} | ${l.Company || '—'} | ${l.LeadSource || '—'}`
    );

    await respond({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Found *${leads.length}* lead(s) for "${keyword}":\n${rows.join('\n')}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Sync all to Constant Contact' },
              action_id: 'sync_search_results',
              value: JSON.stringify({ keyword }),
              style: 'primary',
            },
          ],
        },
      ],
    });
  } catch (err) {
    await respond({ text: `:x: Error: ${err.message}` });
  }
});

// Button: sync search results to Constant Contact
app.action('sync_search_results', async ({ body, ack, respond }) => {
  await ack();
  const { keyword } = JSON.parse(body.actions[0].value);

  try {
    const leads = await sf.searchLeads(keyword);
    const results = await Promise.allSettled(leads.map(l => cc.upsertContact(l)));
    const succeeded = results.filter(r => r.status === 'fulfilled').length;

    await respond({
      text: `:white_check_mark: Synced *${succeeded}* of ${leads.length} lead(s) to Constant Contact.`,
      replace_original: true,
    });
  } catch (err) {
    await respond({ text: `:x: Sync failed: ${err.message}`, replace_original: true });
  }
});

// /cc-lists — show available Constant Contact lists
app.command('/cc-lists', async ({ ack, respond }) => {
  await ack();
  try {
    const lists = await cc.getLists();
    if (lists.length === 0) {
      return respond({ text: 'No contact lists found in Constant Contact.' });
    }
    const rows = lists.map(l => `• \`${l.list_id}\` — *${l.name}* (${l.membership_count ?? '?'} contacts)`);
    await respond({ text: `*Constant Contact Lists:*\n${rows.join('\n')}` });
  } catch (err) {
    await respond({ text: `:x: Error: ${err.message}` });
  }
});

// /cc-campaign <list_id> <subject> | <from_name> | <from_email>
// A minimal quick-send. For complex campaigns, use the CC web app.
app.command('/cc-campaign', async ({ command, ack, respond }) => {
  await ack();

  const parts = command.text.split('|').map(s => s.trim());
  if (parts.length < 4) {
    return respond({
      text: 'Usage: `/cc-campaign <list_id> | <subject> | <from_name> | <from_email>`\n' +
            'Example: `/cc-campaign abc123 | June Newsletter | G Mile Services | hello@gmile.com`',
    });
  }

  const [listId, subject, fromName, fromEmail] = parts;

  const htmlBody = `
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2>${subject}</h2>
  <p>Thank you for being a valued contact of G Mile Services LLC.</p>
  <p>We'll be in touch soon with more updates.</p>
  <hr/>
  <small>You received this because you're on our contact list.
  <a href="{{unsubscribe}}">Unsubscribe</a></small>
</body></html>`;

  try {
    const result = await cc.createAndScheduleCampaign({
      name: `${subject} (${new Date().toISOString().slice(0, 10)})`,
      subject,
      htmlBody,
      fromEmail,
      fromName,
      listIds: [listId],
    });

    await respond({
      text: `:envelope: Campaign created and scheduled!\n• Campaign ID: \`${result.campaignId}\`\n• Sends at: ${result.scheduledAt}`,
    });
  } catch (err) {
    await respond({ text: `:x: Error: ${err.message}` });
  }
});

function parseArgs(text) {
  const args = {};
  const parts = (text || '').trim().split(/\s+/);
  for (const part of parts) {
    const [key, val] = part.split(':');
    if (key && val) args[key] = val;
  }
  return args;
}

module.exports = { app };
