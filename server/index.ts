import express from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { registerRoutes } from './routes';
import { initializeSlackApp } from './slack/bolt';
import { startScheduler } from './jobs/scheduler';
import { log, setupVite } from './vite';

const app = express();

// Register middleware
app.use('/webhooks', bodyParser.raw({ type: 'application/json' })); // Only for webhooks
app.use(express.json()); // For API endpoints
app.use(express.urlencoded({ extended: true }));

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

async function start() {
  try {
    // Initialize Slack app
    await initializeSlackApp(app);
    
    // Register API routes
    await registerRoutes(app);
    
    // Create HTTP server
    const server = createServer(app);
    
    // Setup Vite for serving frontend
    await setupVite(app, server);
    
    // Start background jobs
    startScheduler();
    
    // Start server
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen(port, '0.0.0.0', () => {
      log(`Synergy VA Ops Hub serving on port ${port}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

start();
