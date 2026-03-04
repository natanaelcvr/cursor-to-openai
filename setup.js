#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');

// Create interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration template
const ENV_TEMPLATE = `# Service port
PORT=3010

# Log format (tiny, combined, common, dev, short)
MORGAN_FORMAT=tiny

# API Key to Cookie mapping (JSON format)
# Format: {"custom-API-Key": "Cookie-value"} or {"custom-API-Key": ["Cookie1", "Cookie2"]}
API_KEYS={API_KEYS_PLACEHOLDER}

# Rotation strategy (random, round-robin, or default)
ROTATION_STRATEGY=default

# Whether to use TLS proxy (true or false)
USE_TLS_PROXY={USE_TLS_PROXY_PLACEHOLDER}

# Whether to use auxiliary proxy server (true or false)
USE_OTHERS_PROXY={USE_OTHERS_PROXY_PLACEHOLDER}

# Proxy server platform
# Options: auto, windows_x64, linux_x64, android_arm64
# auto: Auto-detect platform
# windows_x64: Windows 64-bit
# linux_x64: Linux 64-bit
# android_arm64: Android ARM 64-bit
PROXY_PLATFORM={PROXY_PLATFORM_PLACEHOLDER}

# Whether to use other interfaces (true or false)
USE_OTHERS={USE_OTHERS_PLACEHOLDER}
`;

// Prompt message
console.log('===== Cursor-To-OpenAI Environment Configuration Wizard =====');
console.log('This script will help you configure the necessary environment variables\n');

// Load configuration from existing .env file
function loadExistingConfig() {
  const envPath = path.join(process.cwd(), '.env');
  let existingConfig = {
    apiKeys: {},
    useTlsProxy: true,
    useOthersProxy: true,
    proxyPlatform: 'auto',
    useOthers: true,
    rotationStrategy: 'default'
  };
  
  if (fs.existsSync(envPath)) {
    console.log('Found existing .env configuration file, will load existing settings as defaults');
    console.log('Tip: Press Enter to keep existing settings unchanged\n');
    
    try {
      // Load .env file
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      
      // Extract API Keys
      if (envConfig.API_KEYS) {
        try {
          existingConfig.apiKeys = JSON.parse(envConfig.API_KEYS);
        } catch (e) {
          console.log('Unable to parse existing API Keys configuration, will use default settings');
        }
      }
      
      // Extract TLS proxy configuration
      if (envConfig.USE_TLS_PROXY !== undefined) {
        existingConfig.useTlsProxy = envConfig.USE_TLS_PROXY === 'true';
      }
      
      // Extract auxiliary proxy server configuration
      if (envConfig.USE_OTHERS_PROXY !== undefined) {
        existingConfig.useOthersProxy = envConfig.USE_OTHERS_PROXY === 'true';
      }
      
      // Extract proxy server platform
      if (envConfig.PROXY_PLATFORM) {
        existingConfig.proxyPlatform = envConfig.PROXY_PLATFORM;
      }

      // Extract whether to use other interfaces
      if (envConfig.USE_OTHERS !== undefined) {
        existingConfig.useOthers = envConfig.USE_OTHERS === 'true';
      }
      
      // Extract rotation strategy
      if (envConfig.ROTATION_STRATEGY) {
        existingConfig.rotationStrategy = envConfig.ROTATION_STRATEGY;
      }
      
      console.log('Successfully loaded existing configuration');
    } catch (error) {
      console.error('Error loading existing configuration:', error.message);
      console.log('Will use default settings');
    }
  } else {
    console.log('No existing .env configuration file found, will create new configuration file');
  }
  
  return existingConfig;
}

// Prompt user for input with default value
function promptWithDefault(question, defaultValue) {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${defaultText}: `, (answer) => {
      // If user only presses Enter, use default value
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

// Collect configuration information
async function collectConfig() {
  // Load existing configuration
  const existingConfig = loadExistingConfig();
  
  const config = {
    apiKeys: {},
    useTlsProxy: existingConfig.useTlsProxy,
    useOthersProxy: existingConfig.useOthersProxy,
    proxyPlatform: existingConfig.proxyPlatform,
    useOthers: existingConfig.useOthers,
    rotationStrategy: existingConfig.rotationStrategy
  };

  // Ask whether to use TLS proxy
  const useTlsProxyPrompt = `Use TLS proxy server? (y/n)`;
  const defaultUseTlsProxy = existingConfig.useTlsProxy ? 'y' : 'n';
  const useTlsProxyAnswer = await promptWithDefault(useTlsProxyPrompt, defaultUseTlsProxy);
  config.useTlsProxy = useTlsProxyAnswer.toLowerCase() === 'y';

  if (config.useTlsProxy) {
    // Ask whether to use auxiliary proxy server
    const useOthersProxyPrompt = `Use auxiliary proxy server (port 10654)? (y/n)`;
    const defaultUseOthersProxy = existingConfig.useOthersProxy ? 'y' : 'n';
    const useOthersProxyAnswer = await promptWithDefault(useOthersProxyPrompt, defaultUseOthersProxy);
    config.useOthersProxy = useOthersProxyAnswer.toLowerCase() === 'y';
    
    // Ask for proxy server platform
    console.log('\nProxy server platform options:');
    console.log('- auto: Auto-detect current system platform');
    console.log('- windows_x64: Windows 64-bit');
    console.log('- linux_x64: Linux 64-bit');
    console.log('- android_arm64: Android ARM 64-bit');
    
    const proxyPlatformPrompt = `Select proxy server platform`;
    const defaultProxyPlatform = existingConfig.proxyPlatform || 'auto';
    config.proxyPlatform = await promptWithDefault(proxyPlatformPrompt, defaultProxyPlatform);
  }

  // Ask whether to use other interfaces
  const useOthersPrompt = `Use other interfaces? (y/n)`;
  const defaultUseOthers = existingConfig.useOthers ? 'y' : 'n';
  const useOthersAnswer = await promptWithDefault(useOthersPrompt, defaultUseOthers);
  config.useOthers = useOthersAnswer.toLowerCase() === 'y';

  // Ask for rotation strategy
  console.log('\nRotation strategy options:');
  console.log('- default: Default strategy');
  console.log('- random: Random strategy');
  console.log('- round-robin: Round-robin strategy');
  
  const rotationStrategyPrompt = `Select rotation strategy`;
  const defaultRotationStrategy = existingConfig.rotationStrategy || 'default';
  config.rotationStrategy = await promptWithDefault(rotationStrategyPrompt, defaultRotationStrategy);

  // Handle API Keys
  const existingApiKeys = Object.keys(existingConfig.apiKeys);
  if (existingApiKeys.length > 0) {
    console.log('\nExisting API Keys:');
    existingApiKeys.forEach(key => console.log(`- ${key}`));
    
    const keepExistingApiKeys = await promptWithDefault('Keep existing API Keys? (y/n)', 'y');
    if (keepExistingApiKeys.toLowerCase() === 'y') {
      config.apiKeys = { ...existingConfig.apiKeys };
    }
  }

  // Ask whether to add new API Key
  const addNewApiKey = await promptWithDefault('Add new API Key? (y/n)', existingApiKeys.length === 0 ? 'y' : 'n');
  if (addNewApiKey.toLowerCase() === 'y') {
    const apiKey = await promptWithDefault('Enter custom API Key (without sk- prefix, will be added automatically)', '');
    if (apiKey) {
      const fullApiKey = apiKey.startsWith('sk-') ? apiKey : `sk-${apiKey}`;
      config.apiKeys[fullApiKey] = [];
    } else {
      // If user skips by pressing Enter, add sk-text by default
      config.apiKeys['sk-text'] = [];
      console.log('Added API Key by default: sk-text');
    }
  } else if (Object.keys(config.apiKeys).length === 0) {
    // If no API Key exists, add sk-text by default
    config.apiKeys['sk-text'] = [];
    console.log('Added API Key by default: sk-text');
  }

  return config;
}

// Generate configuration file
function generateEnvFile(config) {
  try {
    // Prepare API Keys
    const apiKeysJson = JSON.stringify(config.apiKeys);
    
    // Replace placeholders in template
    let envContent = ENV_TEMPLATE
      .replace('{API_KEYS_PLACEHOLDER}', apiKeysJson)
      .replace('{USE_TLS_PROXY_PLACEHOLDER}', config.useTlsProxy)
      .replace('{USE_OTHERS_PROXY_PLACEHOLDER}', config.useOthersProxy)
      .replace('{PROXY_PLATFORM_PLACEHOLDER}', config.proxyPlatform)
      .replace('{USE_OTHERS_PLACEHOLDER}', config.useOthers);
    
    // Update rotation strategy
    envContent = envContent.replace('ROTATION_STRATEGY=default', `ROTATION_STRATEGY=${config.rotationStrategy}`);
    
    // Write to .env file
    const envPath = path.join(process.cwd(), '.env');
    
    // Check if backup file exists
    const backupPath = path.join(process.cwd(), '.env.backup');
    if (fs.existsSync(envPath)) {
      // Create backup
      fs.copyFileSync(envPath, backupPath);
      console.log(`\n✅ Created backup of original config file: ${backupPath}`);
    }
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`\n✅ Configuration file generated: ${envPath}`);
    
    // Check data directory
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`✅ Created data directory: ${dataDir}`);
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ Error generating config file:', error.message);
    return false;
  }
}

// Main function
async function main() {
  try {
    const config = await collectConfig();
    
    if (generateEnvFile(config)) {
      console.log('\n===== Configuration complete =====');
      console.log('You can use the following command to start the service:');
      console.log('  npm start');
      
      // Display TLS proxy configuration
      console.log(`\nCurrent TLS proxy configuration:`);
      console.log(`- TLS proxy enabled: ${config.useTlsProxy ? 'Yes' : 'No'}`);
      if (config.useTlsProxy) {
        console.log(`- Auxiliary proxy server enabled: ${config.useOthersProxy ? 'Yes' : 'No'}`);
        console.log(`- Proxy server platform: ${config.proxyPlatform}`);
      }

      // Display whether other interfaces are used
      console.log(`\nOther interfaces enabled: ${config.useOthers ? 'Yes' : 'No'}`);
      
      // Display rotation strategy
      console.log(`\nCurrent rotation strategy: ${config.rotationStrategy}`);
      
      // Display API Keys
      console.log('\nCurrently configured API Keys:');
      Object.keys(config.apiKeys).forEach(key => console.log(`- ${key}`));
    }
  } catch (error) {
    console.error('\n❌ Error during configuration:', error.message);
  } finally {
    rl.close();
  }
}

// Run main function
main(); 