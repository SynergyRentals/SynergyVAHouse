# Replit Deployment Setup Guide

This guide will help you configure the required environment variables for deploying the Synergy VA Ops Hub on Replit.

## Prerequisites

Before deploying, ensure you have:

1. A Neon PostgreSQL database provisioned
2. A Replit account with this project
3. (Optional) Slack app credentials if you want Slack integration

## Required Environment Variables

Configure these in Replit's Secrets (Tools > Secrets):

### 1. DATABASE_URL

**Description**: PostgreSQL connection string from your Neon database

**Where to get it**:
- Go to your Neon dashboard
- Select your database
- Copy the connection string (should start with `postgresql://`)

**Example**:
```
postgresql://username:password@host.neon.tech/dbname?sslmode=require
```

**In Replit Secrets**:
- Key: `DATABASE_URL`
- Value: Your Neon connection string

---

### 2. SESSION_SECRET

**Description**: Secret key for encrypting session data

**How to generate**:

Option A - Using OpenSSL (in Replit Shell):
```bash
openssl rand -base64 32
```

Option B - Using Node.js (in Replit Shell):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**In Replit Secrets**:
- Key: `SESSION_SECRET`
- Value: The generated random string (32+ characters)

---

### 3. REPLIT_DOMAINS

**Description**: Comma-separated list of Replit domains for OIDC authentication

**Where to get it**:
This should be automatically provided by Replit through the "Log in with Replit" integration.

If not automatically set:
- Key: `REPLIT_DOMAINS`
- Value: Your Repl's domain (e.g., `your-repl-name.your-username.repl.co`)

---

### 4. REPL_ID

**Description**: Replit project ID for OIDC authentication

**Where to get it**:
This should be automatically provided by Replit through the "Log in with Replit" integration.

If not automatically set, you can find it in:
- Replit project settings
- Or from the Replit Auth integration configuration

---

## Optional Environment Variables

These are not required for basic operation but enable additional features:

### Slack Integration

**SLACK_BOT_TOKEN**
- Description: Slack bot token (starts with `xoxb-`)
- Where to get it: Slack App dashboard > OAuth & Permissions

**SLACK_SIGNING_SECRET**
- Description: Slack signing secret for webhook verification
- Where to get it: Slack App dashboard > Basic Information

**SLACK_APP_LEVEL_TOKEN**
- Description: Slack app-level token for socket mode (starts with `xapp-`)
- Where to get it: Slack App dashboard > Basic Information

### OpenAI Integration

**OPENAI_API_KEY**
- Description: OpenAI API key for AI-powered suggestions
- Where to get it: OpenAI dashboard > API Keys

---

## Deployment Steps

### 1. Configure Environment Variables

1. Click **Tools** > **Secrets** in Replit
2. Add all required environment variables listed above
3. Verify each value is correct

### 2. Install Dependencies (if needed)

If dependencies aren't installed automatically:

```bash
npm install
```

### 3. Build the Application

```bash
npm run build
```

### 4. Deploy/Publish

1. Click the **Deploy** button in Replit
2. Choose your deployment settings
3. Click **Publish**

### 5. Verify Deployment

Once deployed, the server will:
1. Validate all environment variables on startup
2. Print configuration status to logs
3. Show helpful error messages if something is missing

Check the deployment logs to verify:
- ✅ All environment variables are configured
- ✅ Database connection is successful
- ✅ Server starts on the configured port

---

## Troubleshooting

### Error: "Missing required environment variable: DATABASE_URL"

**Solution**: Add `DATABASE_URL` to Replit Secrets with your Neon connection string

### Error: "Missing required environment variable: SESSION_SECRET"

**Solution**: Generate a random secret using `openssl rand -base64 32` and add to Replit Secrets

### Error: "Missing required environment variable: REPLIT_DOMAINS"

**Solution**:
1. Check if the "Log in with Replit" integration is properly configured
2. Manually add your Repl's domain to Secrets if needed

### Error: "Cannot find module" or dependency issues

**Solution**: Run `npm install` in the Replit Shell

### Build fails with Puppeteer error

**Solution**: The `.replit` file now includes `PUPPETEER_SKIP_DOWNLOAD=true` which should prevent this. If it still fails, set this environment variable manually.

---

## Verifying Configuration

The server now includes automatic environment validation. When you start the server (either in dev or production), you'll see:

```
============================================================
🔍 ENVIRONMENT CONFIGURATION CHECK
============================================================

✅ All required variables are set

⚠️  OPTIONAL VARIABLES (not configured):
  ⚠️  SLACK_BOT_TOKEN: Slack bot token for Slack integration (optional)
  ...

============================================================
```

If any required variables are missing, you'll see detailed error messages explaining what's needed and how to configure it.

---

## Support

If you encounter issues:

1. Check the deployment logs for detailed error messages
2. Verify all environment variables are correctly set in Replit Secrets
3. Ensure your Neon database is accessible and the connection string is correct
4. Check that Replit integrations (Database, Log in with Replit) are properly configured

---

## Database Setup

Make sure your Neon database has the required tables. Run migrations if needed:

```bash
npm run db:push
```

This will sync your database schema with the Drizzle ORM schema definitions.
