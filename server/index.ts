import express from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { registerRoutes } from './routes';
import { initializeSlackApp } from './slack/bolt';
import { startScheduler } from './jobs/scheduler';
import { log, setupVite, serveStatic } from './vite';
import { storage } from './storage';
import { validateEnvironmentOrThrow } from './envValidator';

const app = express();

// Register middleware in the correct order
// Raw body parsing ONLY for webhooks, JSON parsing for everything else
app.use('/webhooks', bodyParser.raw({ 
  type: 'application/json',
  limit: '10mb'
}));

// JSON and URL-encoded parsing for non-webhook routes
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks')) {
    return next(); // Skip JSON parsing for webhooks
  }
  express.json()(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks')) {
    return next(); // Skip URL-encoded parsing for webhooks
  }
  express.urlencoded({ extended: true })(req, res, next);
});

// Security headers middleware
app.use((req, res, next) => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // Content Security Policy
  let csp = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for Tailwind
    "img-src 'self' data: blob:", // Allow images from same origin, data URLs, and blobs
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ];

  if (isDevelopment) {
    // More permissive CSP for development to support Vite HMR
    csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Allow eval and inline scripts for Vite
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' ws: wss:", // Allow WebSocket for HMR
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ];
  } else {
    // Strict CSP for production
    csp.push("script-src 'self'"); // No eval or inline scripts in production
    csp.push("connect-src 'self'"); // Only same-origin connections
  }

  res.setHeader('Content-Security-Policy', csp.join('; '));
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  
  // Strict Transport Security (HTTPS only)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
});

// Custom logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.url.startsWith('/api') || req.url.startsWith('/slack') || req.url.startsWith('/webhooks')) {
      log(`${req.method} ${req.url} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

// WebSocket server setup with authentication
async function setupWebSocketServer(server: any) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: async (info: { origin: string; secure: boolean; req: any }) => {
      try {
        // Parse session from cookies for authentication
        const cookieHeader = info.req.headers.cookie;
        if (!cookieHeader) {
          console.log('[WebSocket] No cookies found, rejecting connection');
          return false;
        }

        // In development, allow connections for testing
        if (process.env.NODE_ENV === 'development') {
          console.log('[WebSocket] Development mode - allowing connection');
          return true;
        }

        // TODO: In production, parse session cookie and verify authentication
        // For now, allow connection - we'll verify user later
        return true;
      } catch (error) {
        console.error('[WebSocket] Authentication error:', error);
        return false;
      }
    }
  });

  // Track connected clients
  const clients = new Set();

  wss.on('connection', async (ws, req) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    console.log(`[WebSocket] Client connected: ${clientId}`);
    
    clients.add(ws);
    
    // Store client info
    (ws as any).clientId = clientId;
    (ws as any).isAlive = true;

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleWebSocketMessage(ws, message, clientId);
      } catch (error) {
        console.error(`[WebSocket] Message parsing error for client ${clientId}:`, error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid message format' 
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', (code, reason) => {
      console.log(`[WebSocket] Client disconnected: ${clientId}, code: ${code}, reason: ${reason}`);
      clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WebSocket] Client error for ${clientId}:`, error);
      clients.delete(ws);
    });

    // Handle ping/pong for keep-alive
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId: clientId,
      timestamp: new Date().toISOString()
    }));
  });

  // Heartbeat to keep connections alive
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        console.log(`[WebSocket] Terminating dead connection: ${ws.clientId}`);
        clients.delete(ws);
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // Check every 30 seconds

  // Clean up on server close
  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  // Store reference for broadcasting
  (global as any).wssBroadcast = (message: any) => {
    const messageStr = JSON.stringify(message);
    let successCount = 0;
    let errorCount = 0;

    wss.clients.forEach((ws: any) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        try {
          ws.send(messageStr);
          successCount++;
        } catch (error) {
          console.error(`[WebSocket] Broadcast error to client ${ws.clientId}:`, error);
          errorCount++;
        }
      }
    });

    if (successCount > 0 || errorCount > 0) {
      console.log(`[WebSocket] Broadcast sent to ${successCount} clients, ${errorCount} errors`);
    }
  };

  log(`WebSocket server initialized on /ws path`);
}

// Handle individual WebSocket messages
async function handleWebSocketMessage(ws: any, message: any, clientId: string) {
  try {
    switch (message.type) {
      case 'ping':
        // Respond to ping with pong
        ws.send(JSON.stringify({ 
          type: 'pong', 
          timestamp: new Date().toISOString() 
        }));
        break;

      case 'subscribe':
        // Handle subscription to specific channels/topics
        console.log(`[WebSocket] Client ${clientId} subscribed to: ${message.channel}`);
        ws.send(JSON.stringify({ 
          type: 'subscribed', 
          channel: message.channel 
        }));
        break;

      case 'heartbeat':
        // Handle client heartbeat
        (ws as any).isAlive = true;
        ws.send(JSON.stringify({ 
          type: 'heartbeat_ack' 
        }));
        break;

      default:
        console.log(`[WebSocket] Unknown message type from client ${clientId}:`, message.type);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: `Unknown message type: ${message.type}` 
        }));
    }
  } catch (error) {
    console.error(`[WebSocket] Message handler error for client ${clientId}:`, error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Internal server error' 
    }));
  }
}

async function start() {
  try {
    console.log('\n🚀 Starting Synergy VA Ops Hub...\n');

    // Validate environment variables first - will throw and stop server if invalid
    validateEnvironmentOrThrow();

    // Initialize Slack app
    await initializeSlackApp(app);

    // Register API routes
    await registerRoutes(app);

    // Create HTTP server
    const server = createServer(app);

    // Setup WebSocket server
    await setupWebSocketServer(server);

    // Setup frontend serving (Vite dev server in development, static files in production)
    if (process.env.NODE_ENV === 'production') {
      serveStatic(app);
    } else {
      await setupVite(app, server);
    }

    // Start background jobs
    startScheduler();

    // Start server
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen(port, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(60));
      console.log(`✅ Synergy VA Ops Hub is running on port ${port}`);
      console.log('='.repeat(60) + '\n');
    });
  } catch (error: any) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ FATAL ERROR: Server failed to start');
    console.error('='.repeat(60));
    console.error('\nError details:');
    console.error(error);

    if (error.message?.includes('environment variable')) {
      console.error('\n💡 This appears to be a configuration issue.');
      console.error('   Please check the environment configuration above.\n');
    } else if (error.message?.includes('EADDRINUSE')) {
      console.error('\n💡 Port is already in use.');
      console.error('   Try stopping other services or changing the PORT.\n');
    } else if (error.message?.includes('database') || error.message?.includes('connection')) {
      console.error('\n💡 Database connection failed.');
      console.error('   Please verify DATABASE_URL is correct and database is accessible.\n');
    }

    console.error('='.repeat(60) + '\n');
    process.exit(1);
  }
}

start();
