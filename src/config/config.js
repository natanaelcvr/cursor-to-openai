// Read and parse API_KEYS environment variable
// Avoid circular dependency, do not import logger here

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

// Parse API Keys configuration
let apiKeysConfig = {};
try {
    if (process.env.API_KEYS) {
        // Parse API Keys string to object
        apiKeysConfig = JSON.parse(process.env.API_KEYS);
        log('INFO', 'Loading API Keys from environment variables...');
        log('INFO', `Successfully parsed API Keys, ${Object.keys(apiKeysConfig).length} keys`);
    }
} catch (error) {
    log('ERROR', 'Failed to parse API_KEYS environment variable: ' + error.message);
    log('ERROR', 'Please ensure API_KEYS is valid JSON format');
}

// Export configuration
module.exports = {
    port: process.env.PORT || 3000,
    
    // Log configuration
    log: {
        level: process.env.LOG_LEVEL || 'INFO', // ERROR, WARN, INFO, DEBUG, TRACE
        format: process.env.LOG_FORMAT || 'colored', // colored, json, text
        toFile: process.env.LOG_TO_FILE === 'true' || false,
        maxSize: parseInt(process.env.LOG_MAX_SIZE || '10', 10) * 1024 * 1024, // Default 10MB
        maxFiles: parseInt(process.env.LOG_MAX_FILES || '10', 10) // Keep last 10 log files
    },

    // Merge API Keys settings
    apiKeys: {
        ...apiKeysConfig,
        ...Object.fromEntries(
            Object.entries(process.env)
                .filter(([key]) => key.startsWith('API_KEY_'))
                .map(([key, value]) => {
                    const apiKey = key.replace('API_KEY_', 'sk-');
                    try {
                        // Try to parse JSON string, supports array format for cookies
                        const parsed = JSON.parse(value);
                        return [apiKey, parsed];
                    } catch (e) {
                        // If not JSON, treat as string
                        return [apiKey, value];
                    }
                })
        )
    },

    defaultRotationStrategy: process.env.ROTATION_STRATEGY || 'round-robin',
    
    // Proxy configuration
    proxy: {
        enabled: process.env.PROXY_ENABLED === 'true' || false,
        url: process.env.PROXY_URL || 'http://127.0.0.1:7890',
    },
    
    // GitHub configuration
    github: {
        token: process.env.GITHUB_TOKEN,
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        workflowId: process.env.GITHUB_WORKFLOW_ID,
        triggerWorkflow: process.env.TRIGGER_WORKFLOW === 'true'
    },
    
    // Workflow parameters
    workflowParams: {
        number: parseInt(process.env.REGISTER_NUMBER || '2', 10),
        maxWorkers: parseInt(process.env.REGISTER_MAX_WORKERS || '1', 10),
        emailServer: process.env.REGISTER_EMAIL_SERVER || 'TempEmail',
        ingestToOneapi: process.env.REGISTER_INGEST_TO_ONEAPI === 'true',
        uploadArtifact: process.env.REGISTER_UPLOAD_ARTIFACT === 'true',
        useConfigFile: process.env.REGISTER_USE_CONFIG_FILE !== 'false',
        emailConfigs: process.env.REGISTER_EMAIL_CONFIGS || '[]'
    },
    
    // Refresh configuration
    refresh: {
        cron: process.env.REFRESH_CRON || '0 */6 * * *',
        minCookieCount: parseInt(process.env.MIN_COOKIE_COUNT || '2', 10),
        enabled: process.env.ENABLE_AUTO_REFRESH === 'true'
    }
};
