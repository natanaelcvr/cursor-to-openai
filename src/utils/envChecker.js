const fs = require('fs');
const path = require('path');

// Add simple log function to prevent circular dependency
function log(level, message) {
  // Output to console only, do not write to file
  const timestamp = new Date().toISOString();
  if (level === 'ERROR') {
    console.error(`[ERROR] ${timestamp} ${message}`);
  } else if (level === 'WARN') {
    console.warn(`[WARN] ${timestamp} ${message}`);
  } else {
    console.log(`[INFO] ${timestamp} ${message}`);
  }
}

/**
 * Check if .env file exists
 * @returns {boolean} Whether the file exists
 */
function checkEnvFileExists() {
  const envPath = path.resolve(process.cwd(), '.env');
  return fs.existsSync(envPath);
}

/**
 * Check if required environment variables are set
 * @returns {Object} Check result with pass status and list of missing variables
 */
function checkRequiredEnvVars() {
  // Define list of required environment variables
  const requiredVars = [
    'API_KEYS', // API Keys configuration
  ];

  // If auto refresh is enabled, check related configuration
  if (process.env.ENABLE_AUTO_REFRESH === 'true') {
    requiredVars.push(
      'GITHUB_TOKEN',
      'GITHUB_OWNER',
      'GITHUB_REPO',
      'GITHUB_WORKFLOW_ID',
      'TRIGGER_WORKFLOW'
    );
  }

  // Check each required environment variable
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  return {
    passed: missingVars.length === 0,
    missingVars
  };
}

/**
 * Execute environment check, exit program if requirements not met
 */
function enforceEnvCheck() {
  log('INFO', 'Checking environment configuration...');
  
  // Check if .env file exists
  const envFileExists = checkEnvFileExists();
  if (!envFileExists) {
    log('ERROR', '\nError: .env file not found!');
    log('ERROR', 'Please create .env file from .env.example and configure required environment variables.');
    log('ERROR', 'Run: cp .env.example .env, or npm run setup\n');
    process.exit(1); // Exit program, status code 1 indicates error
  }
  
  // Check required environment variables
  const { passed, missingVars } = checkRequiredEnvVars();
  if (!passed) {
    log('ERROR', '\nError: The following required environment variables are not set in .env file:');
    missingVars.forEach(varName => {
      log('ERROR', `  - ${varName}`);
    });
    log('ERROR', '\nPlease configure these variables in .env file and restart the program.\n');
    process.exit(1); // Exit program, status code 1 indicates error
  }
  
  log('INFO', 'Environment check passed, continuing startup...');
}

module.exports = {
  checkEnvFileExists,
  checkRequiredEnvVars,
  enforceEnvCheck
}; 