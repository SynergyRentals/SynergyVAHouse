# Application Monitoring Guide

This guide provides comprehensive information about monitoring the SynergyVAHouse application using the built-in health check endpoints.

## Table of Contents

- [Overview](#overview)
- [Health Check Endpoints](#health-check-endpoints)
- [Response Format](#response-format)
- [Service Status Levels](#service-status-levels)
- [Monitoring Setup](#monitoring-setup)
- [Kubernetes Integration](#kubernetes-integration)
- [Alerting Recommendations](#alerting-recommendations)
- [Troubleshooting](#troubleshooting)

## Overview

The application provides three health check endpoints for monitoring application status and dependencies:

- `/healthz` - Legacy endpoint for basic health checks (backward compatibility)
- `/health` - Comprehensive health check with detailed service status
- `/ready` - Kubernetes readiness probe endpoint

All health check endpoints are **publicly accessible** and do not require authentication to ensure monitoring tools can access them.

## Health Check Endpoints

### GET /healthz

**Purpose:** Basic health check for backward compatibility

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-22T10:30:00.000Z"
}
```

**HTTP Status Codes:**
- `200 OK` - Always returns 200 if the server is running

**Use Case:** Simple uptime monitoring, load balancer health checks

---

### GET /health

**Purpose:** Comprehensive health check with detailed service status information

**Query Parameters:**
- `details=true` (optional) - Include detailed service check results with response times and error messages

**Response (without details):**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-22T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "services": {
    "database": "up",
    "slack": "up"
  }
}
```

**Response (with details=true):**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-22T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "services": {
    "database": "up",
    "slack": "up"
  },
  "details": {
    "database": {
      "status": "up",
      "responseTime": 15,
      "message": "Database connection successful"
    },
    "slack": {
      "status": "up",
      "responseTime": 120,
      "message": "Slack API connection successful",
      "details": {
        "configured": true,
        "team": "T01234567",
        "user": "U01234567"
      }
    }
  }
}
```

**HTTP Status Codes:**
- `200 OK` - Application is healthy or degraded (operational)
- `503 Service Unavailable` - Application is unhealthy (critical service down)

**Use Case:**
- Application performance monitoring (APM)
- Detailed health dashboards
- Debugging production issues
- Pre-deployment checks

---

### GET /ready

**Purpose:** Kubernetes readiness probe to determine if the application is ready to receive traffic

**Response:**
Same format as `/health` (always includes details)

**HTTP Status Codes:**
- `200 OK` - Application is ready to receive traffic
- `503 Service Unavailable` - Application is not ready (e.g., database connection failed)

**Readiness Criteria:**
- Database must be `up` (critical dependency)
- Slack can be `degraded` (not configured) but not `down`

**Use Case:**
- Kubernetes readiness probes
- Load balancer health checks (strict mode)
- Rolling deployment verification

## Response Format

### Status Field

The `status` field indicates the overall application health:

| Status | Description | HTTP Code |
|--------|-------------|-----------|
| `healthy` | All services operational | 200 |
| `degraded` | Application operational but with limited functionality | 200 |
| `unhealthy` | Critical service failure, application may not function correctly | 503 |

### Version Field

The `version` field contains the application version from `package.json`.

### Uptime Field

The `uptime` field contains the server uptime in seconds since the application started.

### Timestamp Field

The `timestamp` field contains the ISO 8601 timestamp when the health check was performed.

### Services Object

The `services` object contains the status of each monitored dependency:

- **database** - PostgreSQL/Neon database connection status
- **slack** - Slack API connection status (optional dependency)

## Service Status Levels

Each service can have one of three statuses:

### up
✅ Service is fully operational and responding normally

**Example:**
- Database: Successfully executed a test query
- Slack: Successfully authenticated with the Slack API

### degraded
⚠️ Service is not fully functional but not preventing core operations

**Example:**
- Slack: Not configured (SLACK_BOT_TOKEN not set)

**Note:** The application can still operate with degraded services, but some features may be unavailable.

### down
❌ Service is not responding or experiencing critical errors

**Example:**
- Database: Connection timeout or authentication failure
- Slack: Invalid token or API error

**Note:** A down critical service (like database) will mark the entire application as unhealthy.

## Monitoring Setup

### Basic Uptime Monitoring

For simple uptime checks, use the `/healthz` endpoint:

```bash
curl https://your-app.example.com/healthz
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-22T10:30:00.000Z"
}
```

### Comprehensive Health Monitoring

For detailed health monitoring, use the `/health` endpoint with details:

```bash
curl https://your-app.example.com/health?details=true
```

### Monitoring Tools Integration

#### Prometheus

Example Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'synergyvahouse'
    metrics_path: '/health'
    params:
      details: ['true']
    static_configs:
      - targets: ['your-app.example.com']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
```

#### Datadog

Example Datadog HTTP check:

```yaml
init_config:

instances:
  - name: SynergyVAHouse Health
    url: https://your-app.example.com/health?details=true
    method: GET
    timeout: 5
    http_response_status_code: 200
```

#### UptimeRobot

1. Create a new monitor
2. Monitor Type: HTTP(s)
3. URL: `https://your-app.example.com/health`
4. Monitoring Interval: 5 minutes
5. Alert Contacts: Your email/Slack/etc.

#### StatusPage.io

Add a component with URL monitor:
- URL: `https://your-app.example.com/health`
- Expected Status: 200
- Check Interval: 60 seconds

## Kubernetes Integration

### Liveness Probe

Checks if the application is running and should be restarted if unhealthy:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: synergyvahouse
spec:
  containers:
  - name: app
    image: your-image:latest
    livenessProbe:
      httpGet:
        path: /healthz
        port: 5000
      initialDelaySeconds: 30
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 3
```

### Readiness Probe

Checks if the application is ready to receive traffic:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: synergyvahouse
spec:
  containers:
  - name: app
    image: your-image:latest
    readinessProbe:
      httpGet:
        path: /ready
        port: 5000
      initialDelaySeconds: 10
      periodSeconds: 5
      timeoutSeconds: 3
      successThreshold: 1
      failureThreshold: 3
```

### Complete Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: synergyvahouse
spec:
  replicas: 3
  selector:
    matchLabels:
      app: synergyvahouse
  template:
    metadata:
      labels:
        app: synergyvahouse
    spec:
      containers:
      - name: app
        image: your-image:latest
        ports:
        - containerPort: 5000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        - name: SLACK_BOT_TOKEN
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: slack-bot-token
        - name: SLACK_SIGNING_SECRET
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: slack-signing-secret
        livenessProbe:
          httpGet:
            path: /healthz
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 3
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## Alerting Recommendations

### Critical Alerts (PagerDuty/On-Call)

Trigger immediate alerts for:

1. **Application Unhealthy** (`status: "unhealthy"`)
   - Condition: `/health` returns 503 status code
   - Action: Page on-call engineer immediately
   - Example: Database connection failure

2. **Service Down for 5+ Minutes**
   - Condition: `/health` returns 503 for 5 consecutive minutes
   - Action: Escalate to senior engineer
   - Example: Persistent database outage

3. **High Error Rate**
   - Condition: Multiple 503 responses in a 1-minute window
   - Action: Alert engineering team
   - Example: Cascading failures

### Warning Alerts (Slack/Email)

Trigger warning alerts for:

1. **Service Degraded** (`status: "degraded"`)
   - Condition: `/health` returns 200 but status is "degraded"
   - Action: Notify engineering team during business hours
   - Example: Slack integration not configured

2. **Slow Health Check Response**
   - Condition: `/health?details=true` response time > 1 second
   - Action: Investigate performance issues
   - Example: Database query slowdown

3. **Frequent Health Check Failures**
   - Condition: Intermittent 503 responses
   - Action: Investigate network or service stability
   - Example: Network connectivity issues

### Example Alert Configuration (PagerDuty)

```json
{
  "name": "SynergyVAHouse Unhealthy",
  "type": "http",
  "check_frequency": 60,
  "http_check": {
    "url": "https://your-app.example.com/health",
    "expected_status": 200
  },
  "alert_rule": {
    "condition": "status_code != 200",
    "duration": "5m",
    "severity": "critical"
  }
}
```

## Troubleshooting

### Health Check Returns 503 - Database Down

**Symptoms:**
```json
{
  "status": "unhealthy",
  "services": {
    "database": "down",
    "slack": "up"
  }
}
```

**Possible Causes:**
1. Database connection string is incorrect
2. Database server is down or unreachable
3. Network connectivity issues
4. Database authentication failure
5. Connection pool exhausted

**Resolution Steps:**
1. Check `DATABASE_URL` environment variable is set correctly
2. Verify database server is running: `pg_isready -h <host> -p <port>`
3. Test database connectivity: `psql $DATABASE_URL -c "SELECT 1"`
4. Check application logs for detailed error messages
5. Restart the application if connection pool is exhausted

### Health Check Returns 200 - Service Degraded (Slack)

**Symptoms:**
```json
{
  "status": "degraded",
  "services": {
    "database": "up",
    "slack": "degraded"
  },
  "details": {
    "slack": {
      "status": "degraded",
      "message": "Slack integration not configured"
    }
  }
}
```

**Cause:** Slack integration is not configured (environment variables not set)

**Resolution:**
1. This is expected if Slack integration is optional
2. To enable Slack, set `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` environment variables
3. See [SLACK_SETUP_GUIDE.md](./SLACK_SETUP_GUIDE.md) for configuration instructions

### Health Check Returns 503 - Slack Down

**Symptoms:**
```json
{
  "status": "degraded",
  "services": {
    "database": "up",
    "slack": "down"
  },
  "details": {
    "slack": {
      "status": "down",
      "message": "invalid_auth",
      "details": {
        "error": "invalid_auth"
      }
    }
  }
}
```

**Possible Causes:**
1. Invalid `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET`
2. Slack token has been revoked
3. Slack API is experiencing issues

**Resolution Steps:**
1. Verify Slack tokens are correct in environment variables
2. Check Slack app configuration at https://api.slack.com/apps
3. Regenerate tokens if necessary
4. Check Slack API status at https://status.slack.com

### Health Check Times Out

**Symptoms:** Health check request takes longer than 1 second or times out

**Possible Causes:**
1. Database query is slow
2. Slack API is slow to respond
3. Network latency issues
4. Application is under heavy load

**Resolution Steps:**
1. Check `/health?details=true` to see which service is slow
2. Investigate database performance if database check is slow
3. Check application resource usage (CPU, memory)
4. Review application logs for performance issues
5. Consider increasing health check timeout in monitoring tools

### Health Check Not Accessible

**Symptoms:** Cannot reach health check endpoint (connection refused, timeout)

**Possible Causes:**
1. Application is not running
2. Firewall blocking access
3. Incorrect URL or port
4. Load balancer misconfiguration

**Resolution Steps:**
1. Verify application is running: `ps aux | grep node`
2. Check application logs for startup errors
3. Verify port 5000 is accessible: `curl http://localhost:5000/health`
4. Check firewall rules allow access to port 5000
5. Verify load balancer health check configuration

## Best Practices

1. **Monitor All Endpoints:**
   - Use `/healthz` for basic uptime monitoring
   - Use `/health` for detailed service monitoring
   - Use `/ready` for Kubernetes readiness probes

2. **Set Appropriate Timeouts:**
   - Health check timeout: 5 seconds
   - Readiness check timeout: 3 seconds
   - Allow for network latency

3. **Configure Alerts Appropriately:**
   - Critical alerts for `unhealthy` status
   - Warning alerts for `degraded` status
   - Consider using different alert channels for different severity levels

4. **Test Health Checks Regularly:**
   - Include health check testing in CI/CD pipeline
   - Test failure scenarios (database down, Slack unavailable)
   - Verify alert notifications are working

5. **Log Health Check Failures:**
   - Health check failures are logged to application logs
   - Review logs regularly for patterns
   - Set up log aggregation for easier analysis

6. **Use Details Parameter Sparingly:**
   - Use `?details=true` for debugging only
   - Avoid using in high-frequency monitoring to reduce load
   - Details include sensitive information (team IDs, user IDs)

7. **Consider Rate Limiting:**
   - If using external monitoring services, be mindful of API rate limits
   - Slack's `auth.test` endpoint is used sparingly
   - Database query is a simple `SELECT 1` to minimize overhead

## Security Considerations

1. **Public Endpoints:**
   - Health check endpoints are intentionally public
   - No authentication required for monitoring tools
   - Do not expose sensitive information in responses

2. **Sensitive Information:**
   - Details parameter includes team/user IDs (non-sensitive)
   - Error messages do not include credentials
   - Database connection errors are sanitized

3. **DDoS Protection:**
   - Consider rate limiting health check endpoints if abused
   - Monitor for unusual traffic patterns
   - Use load balancer or WAF for protection

## Additional Resources

- [Replit Setup Guide](./REPLIT_SETUP.md)
- [Slack Setup Guide](./SLACK_SETUP_GUIDE.md)
- [Authentication Implementation](./AUTH_IMPLEMENTATION.md)
- [Kubernetes Documentation](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Slack API Documentation](https://api.slack.com/docs)

## Support

If you encounter issues with health checks or monitoring:

1. Check application logs for detailed error messages
2. Review this troubleshooting guide
3. Test health checks manually using `curl`
4. Contact the engineering team with:
   - Health check response (with `?details=true`)
   - Application logs
   - Environment configuration (sanitized)
   - Steps to reproduce the issue
