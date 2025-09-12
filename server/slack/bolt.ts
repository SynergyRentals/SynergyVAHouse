import App from '@slack/bolt';
import type { Express } from 'express';
import { setupAppHome } from './app_home';
import { setupCommands } from './commands';
import { setupActions } from './actions';
import { setupModals } from './modals';

let slackApp: App;

export async function initializeSlackApp(app: Express) {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_SIGNING_SECRET) {
    console.log('Slack tokens not configured, skipping Slack integration');
    return;
  }

  slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    customRoutes: [
      {
        path: '/slack/events',
        method: ['POST'],
        handler: (req, res) => {
          // Handle Slack events
          res.writeHead(200);
          res.end('OK');
        }
      }
    ]
  });

  // Setup Slack features
  setupAppHome(slackApp);
  setupCommands(slackApp);
  setupActions(slackApp);
  setupModals(slackApp);

  // Register Slack routes with Express
  app.post('/slack/events', async (req, res) => {
    const body = req.body as any;
    
    // Handle URL verification
    if (body.type === 'url_verification') {
      res.json({ challenge: body.challenge });
      return;
    }
    
    // Handle other events
    res.json({ ok: true });
  });

  app.post('/slack/interactive', async (req, res) => {
    // Handle interactive components
    res.json({ ok: true });
  });

  await slackApp.start();
  console.log('⚡️ Slack app is running!');
}

export function getSlackApp(): App {
  return slackApp;
}
