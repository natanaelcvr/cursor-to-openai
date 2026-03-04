const config = require('../config/config');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Invalid cookie storage file path
const INVALID_COOKIES_FILE = path.join(__dirname, '../../data/invalid_cookies.json');
// API Keys storage file path
const API_KEYS_FILE = path.join(__dirname, '../../data/api_keys.json');

// Ensure data directory exists
function ensureDataDirExists() {
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory: ${dataDir}`);
    } catch (err) {
      logger.error('Failed to create data directory:', err);
    }
  }
}

// Store API key to Cursor cookie mapping
let apiKeyMap = new Map();

// Store cookie rotation index for each API key
let rotationIndexes = new Map();

// Store cookies marked as invalid
let invalidCookies = new Set();

// Load invalid cookies from file
function loadInvalidCookiesFromFile() {
  ensureDataDirExists();
  
  try {
    if (fs.existsSync(INVALID_COOKIES_FILE)) {
      const data = fs.readFileSync(INVALID_COOKIES_FILE, 'utf8');
      const cookiesArray = JSON.parse(data);
      
      // Clear current set and add cookies loaded from file
      invalidCookies.clear();
      cookiesArray.forEach(cookie => invalidCookies.add(cookie));
      
      logger.info(`Loaded ${cookiesArray.length} invalid cookies from file`);
    } else {
      saveInvalidCookiesToFile(); // Create new file if it doesn't exist
    }
  } catch (err) {
    logger.error('Failed to load invalid cookies file:', err);
    saveInvalidCookiesToFile(); // Try to create new file if load fails
  }
}

// Save invalid cookies to file
function saveInvalidCookiesToFile() {
  ensureDataDirExists();
  
  try {
    const cookiesArray = Array.from(invalidCookies);
    fs.writeFileSync(INVALID_COOKIES_FILE, JSON.stringify(cookiesArray, null, 2), 'utf8');
    logger.info(`Saved ${cookiesArray.length} invalid cookies to file`);
  } catch (err) {
    logger.error('Failed to save invalid cookies file:', err);
  }
}

// Load API Keys from file
function loadApiKeysFromFile() {
  ensureDataDirExists();
  
  try {
    if (fs.existsSync(API_KEYS_FILE)) {
      const data = fs.readFileSync(API_KEYS_FILE, 'utf8');
      const apiKeysObj = JSON.parse(data);
      
      // Clear existing mapping
      apiKeyMap.clear();
      rotationIndexes.clear();
      
      // Count total cookies
      let totalCookies = 0;
      
      // Add API Keys loaded from file
      for (const [apiKey, cookies] of Object.entries(apiKeysObj)) {
        if (Array.isArray(cookies)) {
          apiKeyMap.set(apiKey, cookies);
          rotationIndexes.set(apiKey, 0);
          totalCookies += cookies.length;
        } else {
          logger.error(`API Key ${apiKey} cookies is not array, skipping`);
        }
      }
      
      const apiKeyCount = Object.keys(apiKeysObj).length;
      logger.info(`Loaded ${apiKeyCount} API Keys from file, total ${totalCookies} cookies`);
      return apiKeyCount > 0;
    } else {
      logger.info('API Keys file does not exist, will use API Keys from config');
      return false;
    }
  } catch (err) {
    logger.error('Failed to load API Keys file:', err);
    return false;
  }
}

// Save API Keys to file
function saveApiKeysToFile() {
  ensureDataDirExists();
  
  try {
    // Convert Map to plain object
    const apiKeysObj = {};
    for (const [apiKey, cookies] of apiKeyMap.entries()) {
      apiKeysObj[apiKey] = cookies;
    }
    
    // Avoid special character handling issues when using JSON.stringify
    const jsonString = JSON.stringify(apiKeysObj, null, 2);
    fs.writeFileSync(API_KEYS_FILE, jsonString, 'utf8');
    logger.info(`Saved ${Object.keys(apiKeysObj).length} API Keys to file`);
    
    // Simplified verification
    try {
      const savedContent = fs.readFileSync(API_KEYS_FILE, 'utf8');
      JSON.parse(savedContent); // Only verify JSON format
      logger.info('Verification passed: all cookies saved completely');
    } catch (verifyErr) {
      logger.error('Error verifying saved content:', verifyErr);
    }
  } catch (err) {
    logger.error('Failed to save API Keys file:', err);
  }
}

// API Keys initialization function
function initializeApiKeys() {
    // First load existing API Keys from file
    const loadedFromFile = loadApiKeysFromFile();
    
    // Check if API Keys config exists in environment variables
    const configApiKeys = config.apiKeys;
    const hasEnvApiKeys = Object.keys(configApiKeys).length > 0;
    
    if (hasEnvApiKeys) {
        logger.info('Detected API Keys config from environment variables, merging with existing config...');
        
        // Record cookie count before merge
        let beforeMergeCookies = 0;
        for (const cookies of apiKeyMap.values()) {
            beforeMergeCookies += cookies.length;
        }
        
        // Merge API Keys from environment variables into existing mapping
        for (const [apiKey, cookieValue] of Object.entries(configApiKeys)) {
            // Get existing cookies (if any)
            const existingCookies = apiKeyMap.get(apiKey) || [];
            
            // Prepare new cookies to add
            let newCookies = [];
            if (typeof cookieValue === 'string') {
                newCookies = [cookieValue];
            } else if (Array.isArray(cookieValue)) {
                newCookies = cookieValue;
            }
            
            // Merge cookies, ensure no duplicates
            const mergedCookies = [...existingCookies];
            for (const cookie of newCookies) {
                if (!mergedCookies.includes(cookie)) {
                    mergedCookies.push(cookie);
                }
            }
            
            // Update mapping
            apiKeyMap.set(apiKey, mergedCookies);
            
            // Ensure rotation index exists
            if (!rotationIndexes.has(apiKey)) {
                rotationIndexes.set(apiKey, 0);
            }
        }
        
        // Record cookie count after merge
        let afterMergeCookies = 0;
        for (const cookies of apiKeyMap.values()) {
            afterMergeCookies += cookies.length;
        }
        
        logger.info(`Before merge: ${beforeMergeCookies} cookies, after merge: ${afterMergeCookies} cookies`);
        
        // Save merged result to file
        saveApiKeysToFile();
    } else if (!loadedFromFile) {
        logger.warn('Warning: Failed to load API Keys from file, and no API Keys configured in environment variables');
    }
    
    // Count API Keys and Cookies
    let totalCookies = 0;
    for (const cookies of apiKeyMap.values()) {
        totalCookies += cookies.length;
    }
    
    logger.info(`API Keys initialization complete, ${apiKeyMap.size} API Keys, ${totalCookies} cookies`);
    
    // Load invalid cookies
    loadInvalidCookiesFromFile();
    
    // Remove known invalid cookies from API Keys
    logger.info('Removing invalid cookies from API Keys...');
    removeInvalidCookiesFromApiKeys();
}

// Remove known invalid cookies from all API Keys
function removeInvalidCookiesFromApiKeys() {
    let totalRemoved = 0;
    
    for (const [apiKey, cookies] of apiKeyMap.entries()) {
        const initialLength = cookies.length;
        
        // Filter out invalid cookies
        const filteredCookies = cookies.filter(cookie => !invalidCookies.has(cookie));
        
        // If cookies were removed, update API Key cookie list
        if (filteredCookies.length < initialLength) {
            const removedCount = initialLength - filteredCookies.length;
            totalRemoved += removedCount;
            
            apiKeyMap.set(apiKey, filteredCookies);
            rotationIndexes.set(apiKey, 0);
            
            logger.info(`Removed ${removedCount} invalid cookies from API Key ${apiKey}, ${filteredCookies.length} remaining`);
        }
    }
    
    logger.info(`Removed ${totalRemoved} invalid cookies from API Keys total`);
    
    // If cookies were removed, save updated API Keys
    if (totalRemoved > 0) {
        saveApiKeysToFile();
    }
}

// Add or update API key mapping
function addOrUpdateApiKey(apiKey, cookieValues) {
    if (!Array.isArray(cookieValues)) {
        cookieValues = [cookieValues];
    }
    
    // Filter out known invalid cookies
    const validCookies = cookieValues.filter(cookie => !invalidCookies.has(cookie));
    
    if (validCookies.length < cookieValues.length) {
        logger.info(`Filtered ${cookieValues.length - validCookies.length} invalid cookies from API Key ${apiKey}`);
    }
    
    apiKeyMap.set(apiKey, validCookies);
    rotationIndexes.set(apiKey, 0);
    
    // Save updated API Keys
    saveApiKeysToFile();
}

// Remove API key mapping
function removeApiKey(apiKey) {
    apiKeyMap.delete(apiKey);
    rotationIndexes.delete(apiKey);
    
    // Save updated API Keys
    saveApiKeysToFile();
}

// Get cookie value for API key (based on rotation strategy)
function getCookieForApiKey(apiKey, strategy = config.defaultRotationStrategy) {
    // If API key doesn't exist, might be cookie itself, return API key (backward compatibility)
    if (!apiKeyMap.has(apiKey)) {
      return apiKey;
    }
    const cookies = apiKeyMap.get(apiKey);
    
    if (!cookies || cookies.length === 0) {
        return apiKey;
    }
    
    if (cookies.length === 1) {
        return cookies[0];
    }
    
    // Select cookie based on strategy
    if (strategy === 'random') {
        // Random strategy
        const randomIndex = Math.floor(Math.random() * cookies.length);
        return cookies[randomIndex];
    } else if(strategy === 'round-robin') {
        // Round-robin strategy
        let currentIndex = rotationIndexes.get(apiKey) || 0;
        const cookie = cookies[currentIndex];
        
        // Update index
        currentIndex = (currentIndex + 1) % cookies.length;
        rotationIndexes.set(apiKey, currentIndex);
        
        return cookie;
    } else {
      // Default strategy
        return cookies[0];
    }
}

// Get all API keys
function getAllApiKeys() {
    return Array.from(apiKeyMap.keys());
}

// Get all cookies for API key
function getAllCookiesForApiKey(apiKey) {
    return apiKeyMap.get(apiKey) || [];
}

// Remove specific cookie from API key cookie list
function removeCookieFromApiKey(apiKey, cookieToRemove) {
    if (!apiKeyMap.has(apiKey)) {
        logger.info(`API Key ${apiKey} does not exist, cannot remove cookie`);
        return false;
    }
    
    const cookies = apiKeyMap.get(apiKey);
    const initialLength = cookies.length;
    
    // Check if trying to remove same value as API Key (possible backward compatibility mode)
    if (cookieToRemove === apiKey && initialLength === 0) {
        logger.info(`API Key ${apiKey} has no cookies, system trying to use API Key itself in backward compatibility mode`);
        return false;
    }
    
    // Filter out cookie to remove
    const filteredCookies = cookies.filter(cookie => cookie !== cookieToRemove);
    
    // If length unchanged, cookie to remove was not found
    if (filteredCookies.length === initialLength) {
        logger.info(`Cookie to remove not found: ${cookieToRemove}`);
        return false;
    }
    
    // Update cookie list
    apiKeyMap.set(apiKey, filteredCookies);
    
    // Reset rotation index
    rotationIndexes.set(apiKey, 0);
    
    // Add removed cookie to invalid cookies set
    invalidCookies.add(cookieToRemove);
    
    // Save invalid cookies to file
    saveInvalidCookiesToFile();
    
    // Save updated API Keys
    saveApiKeysToFile();
    
    logger.info(`Removed cookie from API Key ${apiKey}: ${cookieToRemove}`);
    logger.info(`Remaining cookies: ${filteredCookies.length}`);
    
    return true;
}

// Get all cookies marked as invalid
function getInvalidCookies() {
    return invalidCookies;
}

// Clear specific invalid cookie record
function clearInvalidCookie(cookie) {
    const result = invalidCookies.delete(cookie);
    
    if (result) {
        // Save updated invalid cookies to file
        saveInvalidCookiesToFile();
    }
    
    return result;
}

// Clear all invalid cookie records
function clearAllInvalidCookies() {
    invalidCookies.clear();
    
    // Save updated invalid cookies to file
    saveInvalidCookiesToFile();
    
    return true;
}

module.exports = {
    addOrUpdateApiKey,
    removeApiKey,
    getCookieForApiKey,
    getAllApiKeys,
    getAllCookiesForApiKey,
    initializeApiKeys,
    removeCookieFromApiKey,
    getInvalidCookies,
    clearInvalidCookie,
    clearAllInvalidCookies,
    loadInvalidCookiesFromFile,
    saveInvalidCookiesToFile,
    loadApiKeysFromFile,
    saveApiKeysToFile
}; 