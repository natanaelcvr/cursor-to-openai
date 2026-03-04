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

// Load environment variables
const ENV_FILE_PATH = path.join(process.cwd(), '.env');
let envContent = '';
let emailConfigs = [];

// App password instructions
function printAppPasswordInstructions() {
  console.log('\n===== How to create a Google App Password =====');
  console.log('1. Visit https://myaccount.google.com/security');
  console.log('2. In the "Sign in to Google" section, click "2-Step Verification"');
  console.log('   (If 2-Step Verification is not enabled, enable it first)');
  console.log('3. At the bottom of the page, find "App passwords" and click to enter');
  console.log('4. In the "Select app" dropdown, choose "Other (Custom name)"');
  console.log('5. Enter a name, e.g. "Cursor Registration"');
  console.log('6. Click "Generate"');
  console.log('7. Copy the generated 16-character app password (format: xxxx xxxx xxxx xxxx)');
  console.log('Note: The app password is shown only once, please save it securely\n');
}

// Load current environment variables and email configuration
function loadEnvironment() {
  try {
    if (!fs.existsSync(ENV_FILE_PATH)) {
      console.error('❌ .env file does not exist, please run setup.js for initial configuration first');
      process.exit(1);
    }

    // Read raw .env file content
    envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    
    // Parse environment variables
    dotenv.config();

    // Try to parse current email configuration
    try {
      const configStr = process.env.REGISTER_EMAIL_CONFIGS;
      if (configStr) {
        emailConfigs = JSON.parse(configStr);
        if (!Array.isArray(emailConfigs)) {
          emailConfigs = [];
        }
      }
    } catch (parseErr) {
      console.warn('⚠️ Error parsing current email configuration, will use empty configuration');
      emailConfigs = [];
    }

    return true;
  } catch (error) {
    console.error(`❌ Failed to load environment variables: ${error.message}`);
    return false;
  }
}

// Save updated email configuration to .env file
function saveEmailConfigs() {
  try {
    // Format email configuration as JSON string
    const configStr = JSON.stringify(emailConfigs);
    
    // Replace configuration in .env file
    let newEnvContent = '';
    
    if (envContent.includes('REGISTER_EMAIL_CONFIGS=')) {
      // Use regex to replace REGISTER_EMAIL_CONFIGS line
      newEnvContent = envContent.replace(
        /REGISTER_EMAIL_CONFIGS=.*/,
        `REGISTER_EMAIL_CONFIGS=${configStr}`
      );
    } else {
      // If config line does not exist, append to end of file
      newEnvContent = `${envContent}\nREGISTER_EMAIL_CONFIGS=${configStr}`;
    }
    
    // Ensure USE_CONFIG_FILE is set to false
    if (newEnvContent.includes('REGISTER_USE_CONFIG_FILE=')) {
      newEnvContent = newEnvContent.replace(
        /REGISTER_USE_CONFIG_FILE=.*/,
        'REGISTER_USE_CONFIG_FILE=false'
      );
    } else {
      newEnvContent = `${newEnvContent}\nREGISTER_USE_CONFIG_FILE=false`;
    }
    
    // Ensure EMAIL_SERVER is set to IMAP
    if (newEnvContent.includes('REGISTER_EMAIL_SERVER=')) {
      newEnvContent = newEnvContent.replace(
        /REGISTER_EMAIL_SERVER=.*/,
        'REGISTER_EMAIL_SERVER=IMAP'
      );
    } else {
      newEnvContent = `${newEnvContent}\nREGISTER_EMAIL_SERVER=IMAP`;
    }
    
    // Write updated content
    fs.writeFileSync(ENV_FILE_PATH, newEnvContent, 'utf8');
    
    console.log('✅ Email configuration successfully saved to .env file');
    return true;
  } catch (error) {
    console.error(`❌ Failed to save email configuration: ${error.message}`);
    return false;
  }
}

// Display all configured emails
function displayEmails() {
  console.log('\n===== Currently configured emails =====');
  
  if (emailConfigs.length === 0) {
    console.log('No configured emails yet');
    return;
  }
  
  emailConfigs.forEach((config, index) => {
    console.log(`[${index + 1}] ${config.email}`);
    console.log(`   IMAP server: ${config.imap_server}`);
    console.log(`   IMAP port: ${config.imap_port}`);
    console.log(`   Username: ${config.username}`);
    console.log(`   App password: ${config.password}`);
    console.log('');
  });
}

// Add new email
function addEmail() {
  console.log('\n===== Add new email =====');
  printAppPasswordInstructions();
  
  rl.question('Enter Gmail address: ', (email) => {
    rl.question('Enter Gmail app password (not email password): ', (password) => {
      // Create new configuration
      const newConfig = {
        email: email,
        imap_server: 'imap.gmail.com',
        imap_port: 993,
        username: email,
        password: password
      };
      
      // Add to configuration list
      emailConfigs.push(newConfig);
      
      console.log(`\n✅ Added email: ${email}`);
      
      // Save to .env file
      if (saveEmailConfigs()) {
        showMainMenu();
      }
    });
  });
}

// Modify email
function modifyEmail() {
  if (emailConfigs.length === 0) {
    console.log('\n❌ No emails available to modify. Please add an email first.');
    showMainMenu();
    return;
  }
  
  console.log('\n===== Modify email =====');
  displayEmails();
  
  rl.question('Enter email number to modify (1-' + emailConfigs.length + '): ', (indexStr) => {
    const index = parseInt(indexStr) - 1;
    
    if (isNaN(index) || index < 0 || index >= emailConfigs.length) {
      console.log('\n❌ Invalid number. Please select again.');
      modifyEmail();
      return;
    }
    
    const currentConfig = emailConfigs[index];
    
    console.log(`\nModifying email: ${currentConfig.email}`);
    
    rl.question(`New Gmail address (current: ${currentConfig.email}, press Enter to keep): `, (email) => {
      const newEmail = email.trim() === '' ? currentConfig.email : email;
      
      rl.question('New app password (press Enter to keep): ', (password) => {
        const newPassword = password.trim() === '' ? currentConfig.password : password;
        
        // Update configuration
        emailConfigs[index] = {
          email: newEmail,
          imap_server: 'imap.gmail.com',
          imap_port: 993,
          username: newEmail,
          password: newPassword
        };
        
        console.log(`\n✅ Modified email configuration: ${newEmail}`);
        
        // Save to .env file
        if (saveEmailConfigs()) {
          showMainMenu();
        }
      });
    });
  });
}

// Delete email
function deleteEmail() {
  if (emailConfigs.length === 0) {
    console.log('\n❌ No emails available to delete.');
    showMainMenu();
    return;
  }
  
  console.log('\n===== Delete email =====');
  displayEmails();
  
  rl.question('Enter email number to delete (1-' + emailConfigs.length + '): ', (indexStr) => {
    const index = parseInt(indexStr) - 1;
    
    if (isNaN(index) || index < 0 || index >= emailConfigs.length) {
      console.log('\n❌ Invalid number. Please select again.');
      deleteEmail();
      return;
    }
    
    const emailToDelete = emailConfigs[index].email;
    
    rl.question(`Confirm delete email "${emailToDelete}"? (y/n): `, (answer) => {
      if (answer.toLowerCase() === 'y') {
        // Delete email
        emailConfigs.splice(index, 1);
        
        console.log(`\n✅ Deleted email: ${emailToDelete}`);
        
        // Save to .env file
        if (saveEmailConfigs()) {
          showMainMenu();
        }
      } else {
        console.log('\nOperation cancelled');
        showMainMenu();
      }
    });
  });
}

// Show main menu
function showMainMenu() {
  console.log('\n===== Email configuration management =====');
  console.log('1. View all emails');
  console.log('2. Add new email');
  console.log('3. Modify email');
  console.log('4. Delete email');
  console.log('0. Exit');
  
  rl.question('Select option (0-4): ', (choice) => {
    switch (choice) {
      case '1':
        displayEmails();
        showMainMenu();
        break;
      case '2':
        addEmail();
        break;
      case '3':
        modifyEmail();
        break;
      case '4':
        deleteEmail();
        break;
      case '0':
        console.log('\n✅ Configuration complete, exiting');
        rl.close();
        break;
      default:
        console.log('\n❌ Invalid selection, please try again');
        showMainMenu();
        break;
    }
  });
}

// Main function
async function main() {
  console.log('===== Cursor-To-OpenAI Email configuration management =====');
  
  // Load current configuration
  if (loadEnvironment()) {
    // Show main menu
    showMainMenu();
  } else {
    console.error('Program exited');
    rl.close();
  }
}

// Run main function
main(); 