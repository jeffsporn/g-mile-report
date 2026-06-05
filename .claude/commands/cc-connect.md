# Constant Contact Integration

Manage the Constant Contact ↔ Salesforce lead sync for G Mile Services.

## What this skill does

When invoked, ask the user which action they want:

1. **Test connection** — Trigger the `test-cc-connection.yml` GitHub Actions workflow on `jeffsporn/g-mile-report` (main branch) and read the job logs to confirm the API is live and show contact lists.

2. **Sync leads** — Trigger the Slack bot's `/sync-leads` command by reminding the user to run it in Slack, or offer to manually trigger a GitHub Actions workflow if one exists for syncing.

3. **Show contact lists** — Trigger the `test-cc-connection.yml` workflow and parse the contact list output from the logs, displaying list names, IDs, and contact counts in a clean table.

4. **Re-authenticate** — Walk the user through getting a fresh OAuth token:
   - Generate the authorization URL: `https://authz.constantcontact.com/oauth2/default/v1/authorize?client_id=954c38a8-4d7f-4af9-8721-f906d7006110&redirect_uri=https://localhost&response_type=code&scope=contact_data%20campaign_data&state=leadsync123`
   - Ask the user to paste the redirect URL
   - Trigger the `get-cc-token.yml` workflow with the extracted code
   - Remind the user to download the `cc-tokens` artifact and update the `CC_ACCESS_TOKEN` GitHub secret

## Key details

- **Repo**: `jeffsporn/g-mile-report`
- **Branch**: `main`
- **Workflows**: `test-cc-connection.yml`, `get-cc-token.yml`
- **Secret name**: `CC_ACCESS_TOKEN` (stored in GitHub repo secrets)
- **CC API key**: `954c38a8-4d7f-4af9-8721-f906d7006110`
- **Token expiry**: 24 hours — re-authenticate daily or when a 401 error appears
- **Scopes**: `contact_data`, `campaign_data`

## After triggering a workflow

Always wait ~15 seconds, then check the run status and fetch job logs to report results back to the user. If the conclusion is `failure`, read the tail of the logs and diagnose the error before reporting.
