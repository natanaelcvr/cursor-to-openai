const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('./logger');

let mainProxyProcess = null;
let othersProxyProcess = null;
let mainProxyLogStream = null;
let othersProxyLogStream = null;

/**
 * Get current system platform
 * @returns {string} Platform identifier
 */
function detectPlatform() {
  const platform = os.platform();
  const arch = os.arch();
  
  if (platform === 'win32' && arch === 'x64') {
    return 'windows_x64';
  } else if (platform === 'linux' && arch === 'x64') {
    return 'linux_x64';
  } else if ((platform === 'android' || platform === 'linux') && (arch === 'arm64' || arch === 'aarch64')) {
    return 'android_arm64';
  }
  
  // Default to linux version
  logger.warn(`Unrecognized platform: ${platform} ${arch}, will use linux_x64 proxy`);
  return 'linux_x64';
}

/**
 * Get proxy server executable file path
 * @param {string} platform Platform type
 * @param {string} proxyType Proxy type ('main' or 'others')
 * @returns {string} Executable file path
 */
function getProxyExecutablePath(platform, proxyType = 'main') {
  let proxyDir;
  
  if (proxyType === 'others') {
    proxyDir = path.join(process.cwd(), 'src', 'proxy', 'others');
  } else {
    proxyDir = path.join(process.cwd(), 'src', 'proxy');
  }
  
  // Select executable based on platform
  switch (platform) {
    case 'windows_x64':
      return path.join(proxyDir, 'cursor_proxy_server_windows_amd64.exe');
    case 'linux_x64':
      return path.join(proxyDir, 'cursor_proxy_server_linux_amd64');
    case 'android_arm64':
      return path.join(proxyDir, 'cursor_proxy_server_android_arm64');
    default:
      logger.warn(`Unknown platform: ${platform}, will use linux_x64 proxy`);
      return path.join(proxyDir, 'cursor_proxy_server_linux_amd64');
  }
}

/**
 * Create and open proxy server log file
 * @param {string} platform Platform type
 * @param {string} proxyType Proxy type ('main' or 'others')
 * @returns {fs.WriteStream} Log file write stream
 */
function createProxyLogFile(platform, proxyType = 'main') {
  try {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create log file name with date and platform info
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const logFileName = `proxy_server_${proxyType}_${platform}_${dateStr}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    // Create log file stream
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    
    // Write log file header
    const headerLine = `\n\n========== ${proxyType} proxy server log - ${platform} - ${now.toISOString()} ==========\n\n`;
    logStream.write(headerLine);
    
    logger.info(`${proxyType} proxy server detailed logs will be recorded to: ${logFilePath}`);
    
    return logStream;
  } catch (error) {
    logger.error(`Failed to create ${proxyType} proxy server log file: ${error.message}`);
    return null;
  }
}

/**
 * Write log to proxy server log file
 * @param {fs.WriteStream} logStream Log file stream
 * @param {string} message Log message
 * @param {string} type Log type (stdout or stderr)
 */
function writeToProxyLog(logStream, message, type = 'stdout') {
  if (!logStream) return;
  
  try {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type}] ${message}\n`;
    logStream.write(logLine);
  } catch (error) {
    logger.error(`Failed to write to proxy server log: ${error.message}`);
  }
}

/**
 * Start single proxy server
 * @param {string} platform Platform type
 * @param {string} proxyType Proxy type ('main' or 'others')
 * @param {number} port Proxy server port
 * @returns {object} Object containing process and log stream
 */
function startSingleProxyServer(platform, proxyType, port) {
  try {
    // Get executable path
    const execPath = getProxyExecutablePath(platform, proxyType);
    
    // Check if file exists
    if (!fs.existsSync(execPath)) {
      logger.error(`${proxyType} proxy server executable not found: ${execPath}`);
      return { process: null, logStream: null };
    }
    
    // On Linux/Android, set executable permissions
    if (platform !== 'windows_x64') {
      try {
        fs.chmodSync(execPath, '755');
      } catch (err) {
        logger.warn(`Could not set ${proxyType} proxy server executable permissions: ${err.message}`);
      }
    }
    
    // Create proxy server log file
    const logStream = createProxyLogFile(platform, proxyType);
    
    // Start proxy server process
    logger.info(`Starting ${proxyType} proxy server on ${platform}: ${execPath}, port: ${port}`);
    
    // Add port parameter
    const args = port ? [`--port=${port}`] : [];
    
    const proxyProcess = spawn(execPath, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Record proxy server detailed logs to file
    proxyProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      writeToProxyLog(logStream, output, 'stdout');
    });
    
    proxyProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString().trim();
      writeToProxyLog(logStream, errorOutput, 'stderr');
      
      // Only log errors to console on startup failure
      if (!proxyProcess.startSuccessful && errorOutput.includes('error')) {
        logger.error(`${proxyType} proxy server startup error: ${errorOutput.split('\n')[0]}`);
      }
    });
    
    proxyProcess.on('error', (err) => {
      logger.error(`${proxyType} proxy server failed to start: ${err.message}`);
      writeToProxyLog(logStream, `Startup failed: ${err.message}`, 'error');
      return { process: null, logStream: null };
    });
    
    proxyProcess.on('close', (code) => {
      // Only log to console on abnormal exit
      if (code !== 0) {
        logger.warn(`${proxyType} proxy server exited, code: ${code}`);
      }
      
      writeToProxyLog(logStream, `Process exited, exit code: ${code}`, 'info');
      
      // Close log file
      if (logStream) {
        logStream.end();
      }
    });
    
    // Wait to ensure startup success
    setTimeout(() => {
      if (proxyProcess && proxyProcess.exitCode === null) {
        proxyProcess.startSuccessful = true;
        logger.info(`${proxyType} proxy server started successfully`);
        writeToProxyLog(logStream, `${proxyType} proxy server started successfully`, 'info');
      } else {
        logger.error(`${proxyType} proxy server failed to start or exited abnormally`);
        writeToProxyLog(logStream, `${proxyType} proxy server failed to start or exited abnormally`, 'error');
      }
    }, 1000);
    
    return { process: proxyProcess, logStream };
  } catch (error) {
    logger.error(`Error starting ${proxyType} proxy server: ${error.message}`);
    return { process: null, logStream: null };
  }
}

/**
 * Start proxy server
 * @returns {boolean} Whether startup succeeded
 */
function startProxyServer() {
  try {
    // Check if proxy is enabled
    const useTlsProxy = process.env.USE_TLS_PROXY === 'true';
    if (!useTlsProxy) {
      logger.warn('TLS proxy server not enabled, skipping startup');
      return true;
    }
    
    // Check if auxiliary proxy server is enabled
    const useOthersProxy = process.env.USE_OTHERS_PROXY === 'true';
    
    // Determine platform to use
    let platform = process.env.PROXY_PLATFORM || 'auto';
    if (platform === 'auto') {
      platform = detectPlatform();
    }
    
    // Start main proxy server (default port 8080)
    const mainProxy = startSingleProxyServer(platform, 'main', 8080);
    mainProxyProcess = mainProxy.process;
    mainProxyLogStream = mainProxy.logStream;
    
    // Start auxiliary proxy server based on config
    if (useOthersProxy) {
      logger.info('Auxiliary proxy server enabled, starting...');
      // Start others proxy server (port 10654)
      const othersProxy = startSingleProxyServer(platform, 'others', 10654);
      othersProxyProcess = othersProxy.process;
      othersProxyLogStream = othersProxy.logStream;
      
      // If auxiliary proxy fails to start, log warning
      if (!othersProxyProcess) {
        logger.warn('Auxiliary proxy server failed to start');
      } else {
        logger.info('Auxiliary proxy server started successfully');
      }
    } else {
      logger.warn('Auxiliary proxy server not enabled, skipping startup');
    }
    
    // If main proxy fails to start, log warning
    if (!mainProxyProcess) {
      logger.warn('Main proxy server failed to start');
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error(`Error starting proxy server: ${error.message}`);
    return false;
  }
}

/**
 * Stop proxy server
 */
function stopProxyServer() {
  const stopSingleProxy = (proxyProcess, logStream, proxyType) => {
    if (proxyProcess) {
      logger.info(`Stopping ${proxyType} proxy server...`);
      writeToProxyLog(logStream, `Stopping ${proxyType} proxy server`, 'info');
      
      // On Windows, use taskkill to force terminate
      if (os.platform() === 'win32') {
        try {
          spawn('taskkill', ['/pid', proxyProcess.pid, '/f', '/t']);
        } catch (err) {
          logger.error(`Failed to terminate ${proxyType} proxy process with taskkill: ${err.message}`);
          writeToProxyLog(logStream, `Failed to terminate ${proxyType} proxy process with taskkill: ${err.message}`, 'error');
        }
      } else {
        // On Linux/Mac, kill directly
        proxyProcess.kill('SIGTERM');
      }
      
      // Allow time to write final logs
      setTimeout(() => {
        // Close log file
        if (logStream) {
          logStream.end();
        }
      }, 500);
    }
  };
  
  // Stop main proxy server
  stopSingleProxy(mainProxyProcess, mainProxyLogStream, 'main');
  mainProxyProcess = null;
  mainProxyLogStream = null;
  
  // Stop others proxy server
  stopSingleProxy(othersProxyProcess, othersProxyLogStream, 'others');
  othersProxyProcess = null;
  othersProxyLogStream = null;
}

// Export module
module.exports = {
  startProxyServer,
  stopProxyServer
};
