require('dotenv').config();

const express = require('express');
const { app: slackApp } = require('./routes/slack');

const PORT = process.env.PORT || 3000;

async function main() {
  // Mount Slack's request receiver at /slack
  const expressApp = express();

  expressApp.use(express.json());

  // Health check
  expressApp.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Slack events & interactions
  expressApp.use('/slack', await slackApp.receiver.requestHandler);

  expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Slack endpoints:');
    console.log(`  Events / commands: POST http://localhost:${PORT}/slack/events`);
    console.log(`  Interactions:      POST http://localhost:${PORT}/slack/events`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
