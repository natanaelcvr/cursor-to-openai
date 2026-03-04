// Load environment variables
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const keyManager = require('./src/utils/keyManager');
const logger = require('./src/utils/logger');

// Create interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Initialize API Keys
keyManager.initializeApiKeys();

// Show menu
function showMenu() {
  logger.info('\n===== Invalid Cookie management tool =====');
  logger.info('1. View all invalid cookies');
  logger.info('2. Add invalid cookie');
  logger.info('3. Delete specific invalid cookie');
  logger.info('4. Clear all invalid cookies');
  logger.info('5. Remove all invalid cookies from API Keys');
  logger.info('6. Exit');
  logger.info('============================');
  
  rl.question('Select option (1-6): ', (answer) => {
    switch(answer) {
      case '1':
        listInvalidCookies();
        break;
      case '2':
        addInvalidCookie();
        break;
      case '3':
        removeInvalidCookie();
        break;
      case '4':
        clearAllInvalidCookies();
        break;
      case '5':
        removeInvalidCookiesFromApiKeys();
        break;
      case '6':
        logger.info('Exiting');
        rl.close();
        break;
      default:
        logger.warn('Invalid selection, please try again');
        showMenu();
        break;
    }
  });
}

// View all invalid cookies
function listInvalidCookies() {
  const invalidCookies = Array.from(keyManager.getInvalidCookies());
  
  logger.info('\n===== All invalid cookies =====');
  if (invalidCookies.length === 0) {
    logger.info('No invalid cookies');
  } else {
    invalidCookies.forEach((cookie, index) => {
      logger.info(`${index + 1}. ${cookie}`);
    });
  }
  
  showMenu();
}

// Add invalid cookie
function addInvalidCookie() {
  rl.question('\nEnter invalid cookie to add: ', (cookie) => {
    if (!cookie.trim()) {
      logger.warn('Cookie cannot be empty');
      showMenu();
      return;
    }
    
    // Add cookie to invalid set
    const invalidCookies = new Set(keyManager.getInvalidCookies());
    invalidCookies.add(cookie.trim());
    
    // Save to file
    const INVALID_COOKIES_FILE = path.join(__dirname, 'data/invalid_cookies.json');
    try {
      // Ensure directory exists
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(INVALID_COOKIES_FILE, JSON.stringify(Array.from(invalidCookies), null, 2), 'utf8');
      logger.info('Invalid cookie added successfully');
      
      // Reload invalid cookies
      keyManager.loadInvalidCookiesFromFile();
    } catch (err) {
      logger.error('Failed to save invalid cookie:', err);
    }
    
    showMenu();
  });
}

// Delete specific invalid cookie
function removeInvalidCookie() {
  const invalidCookies = Array.from(keyManager.getInvalidCookies());
  
  if (invalidCookies.length === 0) {
    logger.warn('\nNo invalid cookies to delete');
    showMenu();
    return;
  }
  
  logger.info('\n===== All invalid cookies =====');
  invalidCookies.forEach((cookie, index) => {
    logger.info(`${index + 1}. ${cookie}`);
  });
  
  rl.question('\nEnter cookie number to delete (1-' + invalidCookies.length + '): ', (answer) => {
    const index = parseInt(answer) - 1;
    
    if (isNaN(index) || index < 0 || index >= invalidCookies.length) {
      logger.warn('Invalid number');
      showMenu();
      return;
    }
    
    const cookieToRemove = invalidCookies[index];
    const result = keyManager.clearInvalidCookie(cookieToRemove);
    
    if (result) {
      logger.info(`Successfully deleted invalid cookie: ${cookieToRemove}`);
    } else {
      logger.warn('Delete failed');
    }
    
    showMenu();
  });
}

// Clear all invalid cookies
function clearAllInvalidCookies() {
  rl.question('\nAre you sure you want to clear all invalid cookies? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      keyManager.clearAllInvalidCookies();
      logger.info('All invalid cookies cleared');
    } else {
      logger.info('Operation cancelled');
    }
    
    showMenu();
  });
}

// Remove all invalid cookies from API Keys
function removeInvalidCookiesFromApiKeys() {
  // Reinitialize API Keys, this automatically removes invalid cookies
  keyManager.initializeApiKeys();
  logger.info('Removed all invalid cookies from API Keys');
  
  showMenu();
}

// Start program
logger.info('Loading invalid cookies...');
keyManager.loadInvalidCookiesFromFile();
showMenu(); 