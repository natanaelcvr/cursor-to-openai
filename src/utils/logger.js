// logger.js - Unified logging system module
const fs = require('fs');
const path = require('path');

// Avoid circular dependency
let config = null;
// Lazy load configuration
function getConfig() {
  if (!config) {
    try {
      config = require('../config/config');
    } catch (err) {
      console.error('Failed to load config file:', err.message);
      config = { log: { level: 'INFO', format: 'colored' } };
    }
  }
  return config;
}

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
  HTTP: 2 // HTTP log level same as INFO
};

// Default log level
let currentLogLevel = LOG_LEVELS.INFO;

// Log format
let logFormat = 'colored'; // colored, json, text

// Colored console output
const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  GREEN: '\x1b[32m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m'
};

// Log file configuration
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
let logToFile = false;

// Logs stored in memory (for web display)
const memoryLogs = [];
const MAX_MEMORY_LOGS = 1000; // Maximum number of log entries to keep in memory

// Ensure log directory exists
function ensureLogDirExists() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error(`Failed to create log directory: ${err.message}`);
    return false;
  }
}

// Initialize file logging
function initFileLogging() {
  const conf = getConfig();
  if (process.env.LOG_TO_FILE === 'true' || (conf.log && conf.log.toFile)) {
    if (ensureLogDirExists()) {
      logToFile = true;
      // Check log file size, rotate if exceeds maximum
      if (fs.existsSync(LOG_FILE)) {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > MAX_LOG_SIZE) {
          rotateLogFile();
        }
      }
      return true;
    }
  }
  return false;
}

// Log file rotation
function rotateLogFile() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newLogFile = path.join(LOG_DIR, `app-${timestamp}.log`);
    if (fs.existsSync(LOG_FILE)) {
      fs.renameSync(LOG_FILE, newLogFile);
    }
    // Clean up old log files, keep last 10
    const logFiles = fs.readdirSync(LOG_DIR)
      .filter(file => file.startsWith('app-') && file.endsWith('.log'))
      .sort()
      .reverse();
    
    if (logFiles.length > 10) {
      logFiles.slice(10).forEach(file => {
        try {
          fs.unlinkSync(path.join(LOG_DIR, file));
        } catch (err) {
          console.error(`Failed to delete old log file: ${err.message}`);
        }
      });
    }
  } catch (err) {
    console.error(`Log file rotation failed: ${err.message}`);
    logToFile = false;
  }
}

// Add log to memory
function addLogToMemory(level, timestamp, ...args) {
  // Add log entry to memory array
  const logEntry = {
    level,
    timestamp,
    message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
  };
  
  memoryLogs.unshift(logEntry); // New logs added to array start
  
  // Keep array within max length
  if (memoryLogs.length > MAX_MEMORY_LOGS) {
    memoryLogs.pop(); // Remove oldest log
  }
}

// Write log to file
function writeLogToFile(level, timestamp, ...args) {
  if (!logToFile) return;
  
  try {
    let logEntry;
    
    if (logFormat === 'json') {
      // JSON format
      const data = args.map(arg => typeof arg === 'object' ? arg : String(arg));
      const logObject = {
        level,
        timestamp,
        message: data.length === 1 ? data[0] : data
      };
      logEntry = JSON.stringify(logObject) + '\n';
    } else {
      // Text format
      logEntry = `[${level}] ${timestamp} ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ')}\n`;
    }
    
    fs.appendFileSync(LOG_FILE, logEntry);
    
    // Check file size, rotate if necessary
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      rotateLogFile();
    }
  } catch (err) {
    console.error(`Failed to write to log file: ${err.message}`);
    logToFile = false;
  }
}

// Get timestamp
function getTimestamp() {
  return new Date().toISOString();
}

// Set log level
function setLogLevel(level) {
  if (typeof level === 'string') {
    level = level.toUpperCase();
    if (LOG_LEVELS[level] !== undefined) {
      currentLogLevel = LOG_LEVELS[level];
    } else {
      error(`Invalid log level: ${level}`);
    }
  } else if (typeof level === 'number' && level >= 0 && level <= 4) {
    currentLogLevel = level;
  } else {
    error(`Invalid log level: ${level}`);
  }
}

// Set log format
function setLogFormat(format) {
  const validFormats = ['colored', 'json', 'text'];
  if (validFormats.includes(format)) {
    logFormat = format;
    return true;
  } else {
    error(`Invalid log format: ${format}`);
    return false;
  }
}

// Format console log
function formatConsoleLog(level, timestamp, color, ...args) {
  if (logFormat === 'json') {
    // JSON format
    const data = args.map(arg => typeof arg === 'object' ? arg : String(arg));
    return JSON.stringify({
      level,
      timestamp,
      message: data.length === 1 ? data[0] : data
    });
  } else if (logFormat === 'text') {
    // Plain text format (no color)
    return `[${level}] ${timestamp} ${args.join(' ')}`;
  } else {
    // Default: colored format
    return `${color}[${level}] ${timestamp}${COLORS.RESET} ${args.join(' ')}`;
  }
}

// Error log
function error(...args) {
  if (currentLogLevel >= LOG_LEVELS.ERROR) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('ERROR', timestamp, COLORS.RED, ...args);
    console.error(formattedLog);
    writeLogToFile('ERROR', timestamp, ...args);
    addLogToMemory('ERROR', timestamp, ...args);
  }
}

// Warning log
function warn(...args) {
  if (currentLogLevel >= LOG_LEVELS.WARN) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('WARN', timestamp, COLORS.YELLOW, ...args);
    console.warn(formattedLog);
    writeLogToFile('WARN', timestamp, ...args);
    addLogToMemory('WARN', timestamp, ...args);
  }
}

// Info log
function info(...args) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('INFO', timestamp, COLORS.GREEN, ...args);
    console.log(formattedLog);
    writeLogToFile('INFO', timestamp, ...args);
    addLogToMemory('INFO', timestamp, ...args);
  }
}

// Debug log
function debug(...args) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('DEBUG', timestamp, COLORS.BLUE, ...args);
    console.log(formattedLog);
    writeLogToFile('DEBUG', timestamp, ...args);
    addLogToMemory('DEBUG', timestamp, ...args);
  }
}

// Trace log
function trace(...args) {
  if (currentLogLevel >= LOG_LEVELS.TRACE) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('TRACE', timestamp, COLORS.CYAN, ...args);
    console.log(formattedLog);
    writeLogToFile('TRACE', timestamp, ...args);
    addLogToMemory('TRACE', timestamp, ...args);
  }
}

// HTTP request log (special handling for filtering)
function http(...args) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('HTTP', timestamp, COLORS.CYAN, ...args);
    console.log(formattedLog);
    writeLogToFile('HTTP', timestamp, ...args);
    addLogToMemory('HTTP', timestamp, ...args);
  }
}

// Get logs from memory
function getLogs(filter = {}) {
  let filteredLogs = [...memoryLogs];
  
  // Filter by log level
  if (filter.level) {
    filteredLogs = filteredLogs.filter(log => log.level === filter.level);
  }
  
  // Filter by time range
  if (filter.startTime) {
    filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= new Date(filter.startTime));
  }
  
  if (filter.endTime) {
    filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= new Date(filter.endTime));
  }
  
  // Search by keyword
  if (filter.search) {
    const searchTerm = filter.search.toLowerCase();
    filteredLogs = filteredLogs.filter(log => 
      log.message.toLowerCase().includes(searchTerm) || 
      log.level.toLowerCase().includes(searchTerm)
    );
  }
  
  // Pagination
  const page = filter.page || 1;
  const pageSize = filter.pageSize || 100;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  return {
    logs: filteredLogs.slice(start, end),
    total: filteredLogs.length,
    page,
    pageSize
  };
}

// Clear memory logs
function clearMemoryLogs() {
  memoryLogs.length = 0;
  info('Memory logs cleared');
}

// Initialize configuration
function initialize() {
  try {
    const conf = getConfig();
    
    // Initialize log level
    const envLevel = process.env.LOG_LEVEL;
    if (envLevel) {
      setLogLevel(envLevel);
    } else if (conf && conf.log && conf.log.level) {
      setLogLevel(conf.log.level);
    }
    
    // Initialize log format
    const envFormat = process.env.LOG_FORMAT;
    if (envFormat) {
      setLogFormat(envFormat);
    } else if (conf && conf.log && conf.log.format) {
      setLogFormat(conf.log.format);
    }
    
    // Initialize file logging
    initFileLogging();
  } catch (err) {
    console.error(`Failed to initialize logging system: ${err.message}`);
  }
}

// Initialize
initialize();

module.exports = {
  LOG_LEVELS,
  setLogLevel,
  setLogFormat,
  error,
  warn,
  info,
  debug,
  trace,
  http,
  // Expose file logging related methods
  enableFileLogging: () => {
    if (ensureLogDirExists()) {
      logToFile = true;
      info('File logging enabled');
      return true;
    }
    return false;
  },
  disableFileLogging: () => {
    logToFile = false;
    info('File logging disabled');
  },
  rotateLogFile,
  // Expose memory log methods
  getLogs,
  clearMemoryLogs
}; 