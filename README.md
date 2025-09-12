# Synergy VA Ops Hub

A comprehensive Slack-first VA operations management system that centralizes task management, enforces SOPs, and provides real-time visibility into virtual assistant operations.

## Features

### 🏠 Slack Integration
- **App Home Dashboards**: Separate views for VAs and managers with real-time task status
- **Slash Commands**: `/task`, `/project`, `/brief`, `/done`, `/blocker`, `/handoff`
- **Message Actions**: Convert any Slack message into a tracked task
- **Automated Briefings**: Daily AM/PM briefs for VAs, manager digest
- **SLA Monitoring**: Real-time breach alerts and escalations

### 📋 Task Management
- **Multi-type Tasks**: Daily/weekly checklists, reactive escalations, project tasks
- **SLA Enforcement**: 10-minute first response SLAs with automated escalation
- **Definition of Done**: Playbook-driven evidence requirements
- **Follow-up Catcher**: Automatically creates tasks from promises in Slack threads

### 📚 SOP Playbooks
- **YAML-driven**: Standardized procedures with steps, SLAs, and DoD requirements
- **Category-based**: Support for reservations, guest messaging, maintenance, etc.
- **Evidence Enforcement**: Required fields and documentation before task completion
- **Escalation Rules**: Configurable night hours and escalation channels

### 📊 Analytics & Reporting
- **Real-time Metrics**: SLA compliance, completion rates, team performance
- **Weekly Scorecards**: Comprehensive performance tracking
- **Google Sheets Export**: Automated reporting for stakeholders
- **Audit Trails**: Complete task history and change tracking

### 🔗 Integrations
- **Conduit & SuiteOp**: HMAC-verified webhooks for automatic task creation
- **Real-time Updates**: WebSocket connections for live dashboard updates
- **External Systems**: Flexible webhook mapping for various platforms

## Tech Stack

- **Backend**: Fastify + TypeScript + Node.js
- **Database**: PostgreSQL with Prisma ORM
- **Frontend**: React + TypeScript + Tailwind CSS
- **Slack**: Bolt SDK for apps and events
- **Scheduling**: node-cron for background jobs
- **Real-time**: WebSocket connections

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Slack app credentials

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/synergy_va_ops

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_LEVEL_TOKEN=xapp-your-app-token

# Application
APP_BASE_URL=https://your-app.replit.app
PORT=5000

# Webhooks
WEBHOOK_CONDUIT_SECRET=your-conduit-secret
WEBHOOK_SUITEOP_SECRET=your-suiteop-secret

# Team Configuration
MANAGER_SLACK_ID=U123456789
TZ_MANAGER=America/Chicago
TZ_TEAM=Asia/Manila
