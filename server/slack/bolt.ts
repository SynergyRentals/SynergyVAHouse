import type { Express, Request, Response } from 'express';
import SlackBolt from '@slack/bolt';
import { setupAppHome } from './app_home';
import { setupCommands } from './commands';
import { setupActions } from './actions';
import { setupModals } from './modals';
import { setupMessageEvents } from './message_events';

const App = (SlackBolt as any).App || SlackBolt;
const ExpressReceiver = (SlackBolt as any).ExpressReceiver || SlackBolt.ExpressReceiver;

let slackApp: any;
let botUserId: string | null = null;

export async function initializeSlackApp(app: Express) {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_SIGNING_SECRET) {
    console.log('Slack tokens not configured, skipping Slack integration');
    return;
  }

  // Use ExpressReceiver to integrate with existing Express app
  // This prevents Slack Bolt from creating its own HTTP server
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoints: '/slack/events',
    processBeforeResponse: true
  });

  slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver
  });

  // Setup Slack features
  setupAppHome(slackApp);
  setupCommands(slackApp);
  setupActions(slackApp);
  setupModals(slackApp);
  setupMessageEvents(slackApp);

  // Mount the Slack receiver router to our Express app
  app.use(receiver.router);

  // No need to call slackApp.start() when using custom receiver with Express
  
  // Cache bot user ID for filtering
  try {
    const authTest = await slackApp.client.auth.test();
    botUserId = authTest.user_id || null;
    console.log(`⚡️ Slack app is running! Bot User ID: ${botUserId}`);
  } catch (error) {
    console.error('Failed to get bot user ID:', error);
    console.log('⚡️ Slack app is running! (without bot user ID)');
  }
}

export function getSlackApp(): any {
  return slackApp;
}

export function getBotUserId(): string | null {
  return botUserId;
}
