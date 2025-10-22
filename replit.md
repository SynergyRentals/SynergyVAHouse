# Synergy VA Ops Hub

## Overview

Synergy VA Ops Hub is a comprehensive Slack-first virtual assistant operations management system designed to centralize task management, enforce standard operating procedures (SOPs), and provide real-time visibility into VA operations. The application serves as a central hub that captures all VA work including daily/weekly checklists, reactive escalations from external systems like Conduit and SuiteOp, and multi-step projects. It guides execution through SOP playbooks and provides automated status reporting and weekly scorecards.

The system addresses critical operational challenges including missed refunds/cancellations, missed guest messages, incomplete daily tasks, poor maintenance follow-through, low visibility into work status, and over-reliance on managers for guidance. It serves a distributed team across multiple timezones (America/Chicago for management, Asia/Manila for VAs) with role-based interfaces for different user types.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript for type safety and maintainability
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent, accessible UI components
- **State Management**: TanStack React Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Updates**: WebSocket integration for live dashboard updates and notifications

### Backend Architecture
- **Runtime**: Node.js 20+ with TypeScript for type safety across the stack
- **Framework**: Express.js for HTTP server and API endpoints
- **Architecture Pattern**: Modular service-oriented design with separate modules for Slack integration, webhooks, task management, and background jobs
- **Background Processing**: node-cron for scheduled jobs including SLA monitoring, briefings, and metric generation
- **API Design**: RESTful endpoints with standardized response formats and error handling

### Slack Integration Layer
- **Framework**: Slack Bolt SDK for comprehensive Slack app functionality
- **Features**: App Home dashboards (separate VA and manager views), slash commands (/task, /project, etc.), message actions for task creation, modal interfaces, and automated notifications
- **Event Handling**: Real-time processing of Slack events, messages, and user interactions

### Data Storage & Schema
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Design**: Normalized relational schema with tables for users, tasks, projects, comments, audits, playbooks, and metric rollups
- **Data Types**: JSONB fields for flexible storage of evidence, approvals, and playbook content
- **Audit Trail**: Comprehensive change tracking for all entities

### SLA & Monitoring System
- **SLA Enforcement**: Automated 10-minute first response SLAs with escalation to designated channels
- **Real-time Monitoring**: Continuous background jobs checking for SLA breaches and overdue tasks
- **Escalation Logic**: Night hours routing and manager notifications for critical issues
- **Progress Tracking**: Task lifecycle management with status transitions and evidence requirements

### Playbook Engine
- **Format**: YAML-driven SOPs stored as JSON in database
- **Structure**: Standardized procedures with steps, SLA definitions, definition of done requirements, and escalation rules
- **Categories**: Support for reservations, guest messaging, maintenance, OTA management, and custom categories
- **Evidence Enforcement**: Required fields and documentation validation before task completion

### Background Job System
- **Scheduler**: node-cron for time-based job execution
- **Job Types**: SLA monitoring, briefing generation, follow-up detection, metric calculation, and automated reporting
- **Timezone Handling**: Multi-timezone support for distributed team operations
- **Error Handling**: Robust error handling and logging for background processes

### Webhook Integration
- **Security**: HMAC signature verification for external system webhooks
- **Mappers**: Event transformation logic to convert external events into internal task structures
- **Supported Systems**: Conduit and SuiteOp with configurable webhook endpoints
- **Task Generation**: Automatic task creation from external escalations with appropriate assignee inference

### Metrics & Analytics
- **Real-time Metrics**: Live calculation of SLA compliance, completion rates, and team performance
- **Historical Data**: Time-series storage of performance metrics with rollup aggregation
- **Reporting**: Weekly scorecards, manager digests, and exportable analytics
- **Dashboard**: Interactive charts and visualizations for performance monitoring

## External Dependencies

### Core Infrastructure
- **Neon Database**: PostgreSQL hosting for production database with connection pooling
- **Slack Platform**: Bot tokens, signing secrets, and app-level tokens for Slack integration
- **Replit Hosting**: Cloud hosting platform with automatic deployments and scaling

### Slack Integration
- **@slack/bolt**: Primary Slack app framework for event handling and API interactions
- **@slack/web-api**: Additional Slack Web API client for advanced operations

### Database & ORM
- **@neondatabase/serverless**: Serverless PostgreSQL client optimized for edge computing
- **drizzle-orm**: Type-safe ORM with schema generation and migration support
- **PostgreSQL**: Production database with JSONB support for flexible data storage

### External System Webhooks
- **Conduit**: Property management system webhook integration with HMAC verification
- **SuiteOp**: Operations platform webhook integration for maintenance and cleaning tasks
- **HMAC Authentication**: Cryptographic verification of webhook authenticity

### Background Processing
- **node-cron**: Scheduled job execution for SLA monitoring, briefings, and metrics
- **Timezone Libraries**: Multi-timezone support for distributed team coordination

### Frontend Libraries
- **@radix-ui Components**: Comprehensive accessible UI component library
- **@tanstack/react-query**: Server state management with caching and synchronization
- **Tailwind CSS**: Utility-first CSS framework for responsive design
- **Lucide React**: Icon library for consistent visual elements

### Development Tools
- **TypeScript**: Type safety across frontend and backend
- **Vite**: Fast development server and build tool with HMR
- **ESBuild**: Fast JavaScript bundler for production builds
- **Drizzle Kit**: Database migration and schema management tools

## Recent Changes

### Production Deployment Fixes (October 22, 2025)

Fixed critical production deployment issues that prevented the published app from loading correctly:

1. **Slack Bolt Integration**: Refactored Slack Bolt to use `ExpressReceiver` instead of creating its own HTTP server. This eliminates request interception issues and integrates cleanly with the existing Express application.

2. **Middleware Ordering**: Updated body parsing middleware to exclude `/slack` routes (similar to `/webhooks`). This ensures ExpressReceiver can perform its own signature-aware raw body parsing for webhook verification, preventing signature mismatch errors.

3. **Error Handling**: Enhanced error objects in `queryClient.ts` to include a `.status` property. This allows the `useAuth` hook to properly detect and handle 401 Unauthorized responses without throwing errors, enabling the login page to display correctly for unauthenticated users.

4. **Production Build Flow**: Confirmed the build process works correctly with `npm run build` generating static assets in `dist/public/` and bundling the server to `dist/index.js`. The production server uses `serveStatic()` to serve the built frontend.

These fixes ensure the published application now correctly displays the login page for unauthenticated users and is ready for production deployment.