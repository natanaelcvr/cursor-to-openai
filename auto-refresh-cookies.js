// Load environment variables
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const keyManager = require('./src/utils/keyManager');
const logger = require('./src/utils/logger');

// Environment check
const envChecker = require('./src/utils/envChecker');
logger.info('Checking environment configuration before startup...');
envChecker.enforceEnvCheck();

// Adapted to new GitHub Actions workflow parameters (use_config_file, email_configs)
logger.info('Environment check passed, adapted to latest GitHub Actions workflow parameters');

const cookieRefresher = require('./src/utils/cookieRefresher');
const config = require('./src/config/config');

// Parse command line arguments
const args = process.argv.slice(2);
const targetApiKey = args.length > 0 ? args[0] : null;
const forceRefresh = args.includes('--force') || args.includes('-f');

// Minimum Cookie count
const MIN_COOKIE_COUNT = process.env.MIN_COOKIE_COUNT || 3;

// Get Cookie refresh mode
const COOKIE_REFRESH_MODE = process.env.COOKIE_REFRESH_MODE || 'append';

// Main function
async function main() {
  logger.info('===== Auto refresh Cookie started =====');
  logger.info(`Minimum Cookie count: ${MIN_COOKIE_COUNT}`);
  logger.info(`Cookie refresh mode: ${COOKIE_REFRESH_MODE} (${COOKIE_REFRESH_MODE === 'replace' ? 'Replace existing cookies' : 'Append new cookies'})`);
  
  if (targetApiKey) {
    logger.info(`Target API Key for refresh: ${targetApiKey}`);
  }
  
  if (forceRefresh) {
    logger.info('Force refresh mode: Ignore Cookie count check');
  }
  
  try {
    // Get all API Keys
    const apiKeys = keyManager.getAllApiKeys();
    
    if (apiKeys.length === 0) {
      logger.warn('Warning: No API Key found in the system');
      
      // Check if API Keys exist in environment variables
      const envApiKeys = Object.keys(config.apiKeys);
      if (envApiKeys.length > 0) {
        logger.info(`Detected ${envApiKeys.length} API Key(s) in environment variables, but not yet loaded into the system`);
        logger.info('Reinitializing API Keys...');
        
        // Reinitialize API Keys
        keyManager.initializeApiKeys();
        
        // Get API Keys again
        const refreshedApiKeys = keyManager.getAllApiKeys();
        if (refreshedApiKeys.length > 0) {
          logger.info(`Successfully loaded ${refreshedApiKeys.length} API Key(s), continuing refresh flow`);
          // Continue with subsequent refresh logic
        } else {
          logger.warn('Still no API Key found after initialization, please check configuration');
          logger.info('===== Auto refresh Cookie ended =====');
          return;
        }
      } else {
        logger.warn('No API Key configured in environment variables, please add API Key first');
        logger.info('===== Auto refresh Cookie ended =====');
        return;
      }
    }
    
    // Get the latest API Keys again (may have been updated by initialization above)
    const updatedApiKeys = keyManager.getAllApiKeys();
    logger.info(`Total of ${updatedApiKeys.length} API Key(s) in the system`);
    
    // If a specific API Key was specified, check if it exists
    if (targetApiKey && !updatedApiKeys.includes(targetApiKey)) {
      logger.error(`Error: Specified API Key "${targetApiKey}" does not exist`);
      logger.info('===== Auto refresh Cookie ended abnormally =====');
      return;
    }
    
    // Filter API Keys to process
    const keysToProcess = targetApiKey ? [targetApiKey] : updatedApiKeys;
    
    // Sort by Cookie count, prioritize API Keys with fewer Cookies
    const sortedKeys = keysToProcess.sort((a, b) => {
      const aCount = keyManager.getAllCookiesForApiKey(a).length;
      const bCount = keyManager.getAllCookiesForApiKey(b).length;
      return aCount - bCount; // Ascending order, fewer Cookies first
    });
    
    // Check if each API Key needs refresh
    let refreshedCount = 0;
    let needRefreshCount = 0;
    
    for (const apiKey of sortedKeys) {
      const cookies = keyManager.getAllCookiesForApiKey(apiKey);
      logger.info(`API Key: ${apiKey}, Cookie count: ${cookies.length}`);
      
      // Determine if refresh is needed: force refresh mode or Cookie count below threshold
      if (forceRefresh || cookies.length < MIN_COOKIE_COUNT) {
        needRefreshCount++;
        if (forceRefresh) {
          logger.info(`Force refreshing API Key: ${apiKey}`);
        } else {
          logger.info(`API Key ${apiKey} has insufficient Cookie count, needs refresh`);
        }
        
        // Execute refresh
        logger.info(`Starting auto refresh Cookie, target API Key: ${apiKey}, minimum Cookie count: ${MIN_COOKIE_COUNT}, refresh mode: ${COOKIE_REFRESH_MODE}`);
        const result = await cookieRefresher.autoRefreshCookies(apiKey, MIN_COOKIE_COUNT);
        
        if (result.success) {
          refreshedCount++;
          logger.info(`Refresh result: ${result.message}`);
          
          // Output additional info based on refresh mode
          if (COOKIE_REFRESH_MODE === 'replace') {
            logger.info(`Replace mode: All existing cookies have been marked invalid, system now uses only new cookies`);
          } else {
            logger.info(`Append mode: Existing cookies retained, new cookies added to the system`);
          }
        } else {
          logger.error(`Refresh failed: ${result.message}`);
        }
      } else {
        logger.info(`API Key ${apiKey} has sufficient Cookie count, no refresh needed`);
      }
    }
    
    logger.info('===== Auto refresh Cookie completed =====');
    logger.info(`Total ${needRefreshCount} API Key(s) needed refresh, successfully refreshed ${refreshedCount}`);
  } catch (error) {
    logger.error('Auto refresh Cookie failed:', error);
    logger.info('===== Auto refresh Cookie ended abnormally =====');
  }
}

// Execute main function
main().catch(err => logger.error(err)); 