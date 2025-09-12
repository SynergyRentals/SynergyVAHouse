# Slack Integration Setup Guide

## Current Status
- ✅ SLACK_BOT_TOKEN: Configured
- ❌ SLACK_SIGNING_SECRET: **MISSING** (Required)
- ❌ SLACK_APP_LEVEL_TOKEN: **MISSING** (Required)
- ✅ SLACK_CHANNEL_ID: Configured

## Issue
The Slack integration is being skipped because these required tokens are missing. The app logs show:
```
Slack tokens not configured, skipping Slack integration
```

## Required Actions

### 1. Get Your Slack Signing Secret
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Select your Synergy VA Ops Hub app
3. Navigate to **Settings** > **Basic Information**
4. In the **App Credentials** section, find **Signing Secret**
5. Click **Show** and copy the signing secret
6. Add it to your Replit Secrets as `SLACK_SIGNING_SECRET`

### 2. Get Your App-Level Token (if using Socket Mode)
1. In your Slack app settings, go to **Settings** > **Basic Information**
2. Scroll down to **App-Level Tokens**
3. If you don't have one, click **Generate Token and Scopes**
4. Add the `connections:write` scope
5. Copy the token (starts with `xapp-`)
6. Add it to your Replit Secrets as `SLACK_APP_LEVEL_TOKEN`

### 3. Verify Required Scopes
Ensure your bot has these OAuth scopes:
- `app_mentions:read`
- `channels:history`
- `channels:read`
- `chat:write`
- `commands`
- `im:history`
- `im:read`
- `im:write`
- `users:read`
- `users:read.email`

### 4. Configure Event Subscriptions
1. Go to **Features** > **Event Subscriptions**
2. Enable Events
3. Set Request URL to: `https://your-replit-app.replit.app/slack/events`
4. Subscribe to these bot events:
   - `app_mention`
   - `message.channels`
   - `message.im`

### 5. Configure Interactive Components
1. Go to **Features** > **Interactivity & Shortcuts**
2. Enable Interactivity
3. Set Request URL to: `https://your-replit-app.replit.app/slack/interactive`

## After Adding Tokens

Once you've added the missing secrets:
1. The app will automatically restart
2. Check the logs for: `⚡️ Slack app is running! Bot User ID: [ID]`
3. Test basic functionality by mentioning the bot in a channel

## Testing the Integration

Try these commands in your Slack workspace:
- `/task` - Create a new task
- `/project` - Create a new project
- Mention the bot: `@YourBot hello`

## Troubleshooting

If you still see "Slack tokens not configured":
1. Verify all three tokens are set in Replit Secrets
2. Check that token values don't have extra spaces
3. Restart the application
4. Check the application logs for specific error messages