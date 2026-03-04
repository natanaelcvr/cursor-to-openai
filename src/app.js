// Load environment variables
require('dotenv').config();

// Add temporary log function before logger loads
function tempLog(level, message) {
  const timestamp = new Date().toISOString();
  if (level === 'ERROR') {
    console.error(`[ERROR] ${timestamp} ${message}`);
  } else if (level === 'WARN') {
    console.warn(`[WARN] ${timestamp} ${message}`);
  } else {
    console.log(`[INFO] ${timestamp} ${message}`);
  }
}

// Environment check
tempLog('INFO', 'Pre-startup environment check...');
const envChecker = require('./utils/envChecker');
// Execute simple check first to avoid circular dependency
envChecker.enforceEnvCheck();

const express = require('express');
const morgan = require('morgan');
const path = require('path');
const cron = require('node-cron');
const app = express();
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');

// Load config first, then logger
const config = require('./config/config');
const logger = require('./utils/logger');
const routes = require('./routes');
const keyManager = require('./utils/keyManager');
const cookieRefresher = require('./utils/cookieRefresher');
const authMiddleware = require('./middleware/auth');
const proxyLauncher = require('./utils/proxyLauncher');

// Initialize proxy server
if (process.env.USE_TLS_PROXY === 'true') {
  logger.info('Starting TLS proxy server...');
  proxyLauncher.startProxyServer();
} else {
  logger.info('TLS proxy server not enabled, skipping proxy startup');
}

// Load routes
const v1Router = require('./routes/v1');

// Initialize API Keys
logger.info('Initializing API Keys...');
keyManager.initializeApiKeys();

// Output final API Keys configuration
logger.debug('Final API Keys configuration:', JSON.stringify(keyManager.getAllApiKeys().reduce((obj, key) => {
  obj[key] = keyManager.getAllCookiesForApiKey(key);
  return obj;
}, {}), null, 2));

// Output cookie count for each API key
const apiKeys = keyManager.getAllApiKeys();
const keySummary = apiKeys.map(key => {
    const cookies = keyManager.getAllCookiesForApiKey(key);
    return `${key}: ${cookies.length} cookies`;
}).join(', ');

logger.info(`Currently loaded ${apiKeys.length} API Keys, details: ${keySummary}`);

// Add CORS support
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Custom Morgan format to output logs to our log system
morgan.token('remote-addr', (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
});

// Create a stream that writes Morgan logs to our log system
const morganLoggerStream = {
  write: (message) => {
    // Remove trailing newline
    const trimmedMessage = message.trim();
    if (trimmedMessage) {
      logger.http(trimmedMessage);
    }
  }
};

// Morgan middleware with custom format
app.use(morgan(process.env.MORGAN_FORMAT || 'combined', { 
  stream: morganLoggerStream,
  // Skip logs for health check and similar routes
  skip: (req, res) => {
    return req.path === '/health' || req.path === '/favicon.ico';
  }
}));

// Add static file support
app.use(express.static(path.join(__dirname, 'public')));

// Add root route, redirect to login page
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Add auth middleware
app.use(authMiddleware);

// API routes
app.use('/v1', v1Router);

app.use("/", routes)

// Set auto scheduled cookie refresh task
if (config.refresh.enabled) {
    logger.info(`Auto refresh Cookie enabled, scheduled task will run every ${config.refresh.interval}`);
    cron.schedule(config.refresh.interval, () => {
        logger.info('Starting scheduled auto refresh Cookie...');
        const scriptPath = path.resolve(__dirname, '../auto-refresh-cookies.js');
        
        const child = spawn('node', [scriptPath], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        child.stdout.on('data', (data) => {
            logger.info(`Refresh process output: ${data.toString().trim()}`);
        });
        
        child.stderr.on('data', (data) => {
            logger.error(`Refresh process error: ${data.toString().trim()}`);
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                logger.info('Auto refresh Cookie scheduled task completed');
            } else {
                logger.error(`Auto refresh Cookie scheduled task exited abnormally, code: ${code}`);
            }
        });
    });
} else {
    logger.info('Auto refresh Cookie not enabled, set ENABLE_AUTO_REFRESH=true to enable');
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Handle 404 requests
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    error: 'Not found',
    message: 'Requested resource does not exist'
  });
});

app.listen(config.port, () => {
    logger.info(`Server started, listening on port: ${config.port}`);
    logger.info(`Open management interface: http://localhost:${config.port}`);
});

// Handle process exit events, cleanup resources
process.on('SIGINT', () => {
  logger.info('Received SIGINT signal, gracefully shutting down...');
  // Stop proxy server
  if (process.env.USE_TLS_PROXY === 'true') {
    logger.info('Stopping TLS proxy server...');
    proxyLauncher.stopProxyServer();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal, gracefully shutting down...');
  // Stop proxy server
  if (process.env.USE_TLS_PROXY === 'true') {
    logger.info('Stopping TLS proxy server...');
    proxyLauncher.stopProxyServer();
  }
  process.exit(0);
});

module.exports = app;
