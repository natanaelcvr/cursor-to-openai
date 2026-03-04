const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { Octokit } = require('@octokit/rest');
const keyManager = require('./keyManager');
const config = require('../config/config');
const { extractCookiesFromCsv } = require('./extractCookieFromCsv');
const logger = require('./logger');

// GitHub repository info from environment variables
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'liuw1535';
const GITHUB_REPO = process.env.GITHUB_REPO || 'Cursor-Register';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Must be set in environment variables
const GITHUB_WORKFLOW_ID = process.env.GITHUB_WORKFLOW_ID || 'register.yml';
const TRIGGER_WORKFLOW = process.env.TRIGGER_WORKFLOW === 'true';

// Download directory
const DOWNLOAD_DIR = path.join(__dirname, '../../downloads');
const EXTRACT_DIR = path.join(__dirname, '../../extracted');

// Ensure directory exists
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory successfully: ${dir}`);
    } catch (err) {
      logger.error(`Failed to create directory: ${dir}`, err);
      throw err;
    }
  }
}

// Trigger GitHub Actions workflow
async function triggerWorkflow() {
  try {
    if (!GITHUB_TOKEN) {
      logger.error('GITHUB_TOKEN not set, cannot trigger workflow');
      return null;
    }

    logger.info(`Triggering GitHub Actions workflow: ${GITHUB_WORKFLOW_ID}...`);
    const octokit = new Octokit({
      auth: GITHUB_TOKEN
    });

    // Get workflow parameters from environment variables
    const number = process.env.REGISTER_NUMBER || '2';
    const maxWorkers = process.env.REGISTER_MAX_WORKERS || '1';
    const emailServer = process.env.REGISTER_EMAIL_SERVER || 'TempEmail';
    const ingestToOneapi = process.env.REGISTER_INGEST_TO_ONEAPI === 'true';
    const uploadArtifact = process.env.REGISTER_UPLOAD_ARTIFACT !== 'false'; // Default true
    const useConfigFile = process.env.REGISTER_USE_CONFIG_FILE !== 'false'; // Default true
    const emailConfigs = process.env.REGISTER_EMAIL_CONFIGS || '[]';

    logger.info(`Workflow params: number=${number}, maxWorkers=${maxWorkers}, emailServer=${emailServer}, ingestToOneapi=${ingestToOneapi}, uploadArtifact=${uploadArtifact}, useConfigFile=${useConfigFile}`);

    // Get latest workflow ID before trigger for identifying newly triggered workflow
    const { data: beforeWorkflowRuns } = await octokit.actions.listWorkflowRuns({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      workflow_id: GITHUB_WORKFLOW_ID,
      per_page: 1
    });
    
    const latestWorkflowIdBefore = beforeWorkflowRuns.workflow_runs && beforeWorkflowRuns.workflow_runs.length > 0 
      ? beforeWorkflowRuns.workflow_runs[0].id 
      : 0;
    
    logger.info(`Latest workflow ID before trigger: ${latestWorkflowIdBefore}`);

    // Trigger workflow
    const response = await octokit.actions.createWorkflowDispatch({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      workflow_id: GITHUB_WORKFLOW_ID,
      ref: 'main', // Default to main branch, modify as needed
      inputs: {
        number: number,
        max_workers: maxWorkers,
        email_server: emailServer,
        ingest_to_oneapi: ingestToOneapi.toString(),
        upload_artifact: uploadArtifact.toString(),
        use_config_file: useConfigFile.toString(),
        email_configs: emailConfigs
      }
    });

    logger.info('Workflow triggered successfully, waiting for workflow to start...');
    
    // Wait for new workflow to appear and get its ID
    let newWorkflowRunId = null;
    let findAttempts = 0;
    const maxFindAttempts = 30; // Max 30 attempts, 5 seconds each
    
    while (findAttempts < maxFindAttempts && !newWorkflowRunId) {
      findAttempts++;
      logger.info(`Looking for newly triggered workflow, attempt ${findAttempts}/${maxFindAttempts}...`);
      
      try {
        const { data: afterWorkflowRuns } = await octokit.actions.listWorkflowRuns({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          workflow_id: GITHUB_WORKFLOW_ID,
          per_page: 5
        });
        
        if (afterWorkflowRuns.workflow_runs && afterWorkflowRuns.workflow_runs.length > 0) {
          // Find workflow with ID greater than previous latest (i.e. newly triggered)
          const newWorkflow = afterWorkflowRuns.workflow_runs.find(run => run.id > latestWorkflowIdBefore);
          if (newWorkflow) {
            newWorkflowRunId = newWorkflow.id;
            logger.info(`Found newly triggered workflow, ID: ${newWorkflowRunId}, status: ${newWorkflow.status}`);
          }
        }
      } catch (error) {
        logger.error(`Error finding workflow (attempt ${findAttempts}/${maxFindAttempts}): ${error.message}`);
        // Continue attempts on error, don't break loop
      }
      
      if (!newWorkflowRunId) {
        // Wait 5 seconds then check again
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (!newWorkflowRunId) {
      logger.info('Could not find newly triggered workflow, trigger may have failed');
      return null;
    }
    
    // Wait for workflow to complete
    let attempts = 0;
    const maxAttempts = 120; // Max 120 attempts, 30 sec each, 60 min total
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5; // Max 5 consecutive errors allowed
    
    while (attempts < maxAttempts) {
      attempts++;
      logger.info(`Waiting for workflow to complete, attempt ${attempts}/${maxAttempts}...`);
      
      try {
        // Get workflow status
        const { data: workflowRun } = await octokit.actions.getWorkflowRun({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          run_id: newWorkflowRunId
        });
        
        // Reset consecutive error count
        consecutiveErrors = 0;
        
        logger.info(`Workflow status: ${workflowRun.status}, result: ${workflowRun.conclusion || 'in progress'}`);
        
        // Check if workflow completed
        if (workflowRun.status === 'completed') {
          if (workflowRun.conclusion === 'success') {
            logger.info(`Workflow run successful, ID: ${newWorkflowRunId}`);
            return workflowRun;
          } else {
            logger.info(`Workflow run failed, result: ${workflowRun.conclusion}`);
            return null;
          }
        }
      } catch (error) {
        consecutiveErrors++;
        logger.error(`Error getting workflow status (attempt ${attempts}/${maxAttempts}, consecutive errors ${consecutiveErrors}/${maxConsecutiveErrors}): ${error.message}`);
        
        // If consecutive errors exceed threshold, give up
        if (consecutiveErrors >= maxConsecutiveErrors) {
          logger.error(`Consecutive errors exceeded threshold (${maxConsecutiveErrors}), giving up`);
          throw new Error(`Failed to get workflow status ${maxConsecutiveErrors} times in a row: ${error.message}`);
        }
        
        // Extend wait time after error
        await new Promise(resolve => setTimeout(resolve, 10000));
        // Continue loop, don't break
        continue;
      }
      
      // Wait 30 seconds then check again
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    logger.info('Waiting for workflow completion timed out');
    return null;
  } catch (error) {
    logger.error('Failed to trigger workflow:', error);
    throw error; // Re-throw for caller to handle
  }
}

// Get latest Artifact from GitHub Actions
async function getLatestArtifact() {
  try {
    logger.info('Connecting to GitHub API...');
    const octokit = new Octokit({
      auth: GITHUB_TOKEN
    });

    // If auto trigger workflow is configured, trigger first
    let workflowRun = null;
    if (TRIGGER_WORKFLOW) {
      logger.info('Auto trigger workflow configured, triggering...');
      try {
        workflowRun = await triggerWorkflow();
      } catch (error) {
        logger.error('Error occurred during workflow trigger:', error.message);
        logger.info('Attempting to continue with found workflow ID...');
        
        // Try to get latest workflow, check if any are running
        const { data: runningWorkflows } = await octokit.actions.listWorkflowRuns({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          workflow_id: GITHUB_WORKFLOW_ID,
          status: 'in_progress',
          per_page: 5
        });
        
        if (runningWorkflows.workflow_runs && runningWorkflows.workflow_runs.length > 0) {
          // Find running workflow
          const runningWorkflow = runningWorkflows.workflow_runs[0];
          logger.info(`Found running workflow, ID: ${runningWorkflow.id}, status: ${runningWorkflow.status}`);
          
          // Wait for workflow to complete
          let attempts = 0;
          const maxAttempts = 120; // Max 120 attempts, 30 sec each, 60 min total
          let consecutiveErrors = 0;
          const maxConsecutiveErrors = 5; // Max 5 consecutive errors allowed
          
          while (attempts < maxAttempts) {
            attempts++;
            logger.info(`Waiting for workflow to complete, attempt ${attempts}/${maxAttempts}...`);
            
            try {
              // Get workflow status
              const { data: currentWorkflow } = await octokit.actions.getWorkflowRun({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                run_id: runningWorkflow.id
              });
              
              // Reset consecutive error count
              consecutiveErrors = 0;
              
              logger.info(`Workflow status: ${currentWorkflow.status}, result: ${currentWorkflow.conclusion || 'in progress'}`);
              
              // Check if workflow completed
              if (currentWorkflow.status === 'completed') {
                if (currentWorkflow.conclusion === 'success') {
                  logger.info(`Workflow run successful, ID: ${currentWorkflow.id}`);
                  workflowRun = currentWorkflow;
                  break;
                } else {
                  logger.info(`Workflow run failed, result: ${currentWorkflow.conclusion}`);
                  break;
                }
              }
            } catch (err) {
              consecutiveErrors++;
              logger.error(`Error getting workflow status (attempt ${attempts}/${maxAttempts}, consecutive errors ${consecutiveErrors}/${maxConsecutiveErrors}): ${err.message}`);
              
              // If consecutive errors exceed threshold, give up
              if (consecutiveErrors >= maxConsecutiveErrors) {
                logger.error(`Consecutive errors exceeded threshold (${maxConsecutiveErrors}), giving up`);
                break;
              }
              
              // Extend wait time after error
              await new Promise(resolve => setTimeout(resolve, 10000));
              // Continue loop, don't break
              continue;
            }
            
            // Wait 30 seconds then check again
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
        }
      }
      
      if (!workflowRun) {
        logger.info('Workflow trigger failed or wait timed out, trying to get latest workflow run');
      }
    }

    // If workflow was not triggered or trigger failed, get latest workflow run
    if (!workflowRun) {
      logger.info('Getting latest workflow run...');
      const { data: workflowRuns } = await octokit.actions.listWorkflowRunsForRepo({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        status: 'success',
        per_page: 5
      });

      if (!workflowRuns.workflow_runs || workflowRuns.workflow_runs.length === 0) {
        logger.info('No successful workflow runs found');
        return null;
      }

      // Get latest successfully run Artifacts
      workflowRun = workflowRuns.workflow_runs[0];
    }
    
    logger.info(`Found latest workflow run: ${workflowRun.id}`);

    // Wait for artifact upload to complete
    logger.info('Waiting for Artifact upload to complete...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Get workflow Artifacts
    let artifacts = null;
    let artifactAttempts = 0;
    const maxArtifactAttempts = 10; // Max 10 attempts, 10 sec each
    
    while (artifactAttempts < maxArtifactAttempts && (!artifacts || !artifacts.artifacts || artifacts.artifacts.length === 0)) {
      artifactAttempts++;
      logger.info(`Attempting to get Artifacts, attempt ${artifactAttempts}/${maxArtifactAttempts}...`);
      
      try {
        const response = await octokit.actions.listWorkflowRunArtifacts({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          run_id: workflowRun.id
        });
        
        artifacts = response.data;
      } catch (error) {
        logger.error(`Error getting Artifacts (attempt ${artifactAttempts}/${maxArtifactAttempts}): ${error.message}`);
        // Continue attempts on error, don't break loop
      }
      
      if (!artifacts || !artifacts.artifacts || artifacts.artifacts.length === 0) {
        logger.info('No Artifacts found yet, waiting 10 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    if (!artifacts || !artifacts.artifacts || artifacts.artifacts.length === 0) {
      logger.info('No Artifacts found, workflow may not have generated Artifact');
      return null;
    }

    logger.info(`Found ${artifacts.artifacts.length} Artifacts`);

    // Find Account info Artifact
    const accountInfoArtifact = artifacts.artifacts.find(artifact => 
      artifact.name.toLowerCase().includes('account info'));

    if (!accountInfoArtifact) {
      logger.info('Account info Artifact not found');
      return null;
    }

    logger.info(`Found Account info Artifact: ${accountInfoArtifact.id}`);
    return accountInfoArtifact;
  } catch (error) {
    logger.error('Failed to get Artifact:', error);
    return null;
  }
}

// Download Artifact
async function downloadArtifact(artifact) {
  let downloadAttempts = 0;
  const maxDownloadAttempts = 5; // Max 5 download attempts
  
  while (downloadAttempts < maxDownloadAttempts) {
    downloadAttempts++;
    try {
      logger.info(`Starting Artifact download: ${artifact.id}... (attempt ${downloadAttempts}/${maxDownloadAttempts})`);
      ensureDirectoryExists(DOWNLOAD_DIR);

      const octokit = new Octokit({
        auth: GITHUB_TOKEN
      });

      // Get download URL
      const { url } = await octokit.actions.downloadArtifact({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        artifact_id: artifact.id,
        archive_format: 'zip'
      });

      // Download zip file
      const zipFilePath = path.join(DOWNLOAD_DIR, `${artifact.id}.zip`);
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'arraybuffer',
        timeout: 60000 // 60 second timeout
      });

      fs.writeFileSync(zipFilePath, response.data);
      logger.info(`Artifact download complete: ${zipFilePath}`);
      return zipFilePath;
    } catch (error) {
      logger.error(`Artifact download failed (attempt ${downloadAttempts}/${maxDownloadAttempts}): ${error.message}`);
      
      if (downloadAttempts >= maxDownloadAttempts) {
        logger.error('Max attempts reached, giving up download');
        return null;
      }
      
      // Wait before retry
      const retryDelay = 10000; // 10 seconds
      logger.info(`Waiting ${retryDelay/1000} seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return null;
}

// Extract Artifact
async function extractArtifact(zipFilePath) {
  let extractAttempts = 0;
  const maxExtractAttempts = 3; // Max 3 extract attempts
  
  while (extractAttempts < maxExtractAttempts) {
    extractAttempts++;
    try {
      logger.info(`Starting Artifact extraction: ${zipFilePath}... (attempt ${extractAttempts}/${maxExtractAttempts})`);
      ensureDirectoryExists(EXTRACT_DIR);

      const zip = new AdmZip(zipFilePath);
      zip.extractAllTo(EXTRACT_DIR, true);
      logger.info(`Artifact extraction complete: ${EXTRACT_DIR}`);

      // Find token CSV file
      const files = fs.readdirSync(EXTRACT_DIR);
      const tokenFile = files.find(file => file.startsWith('token_') && file.endsWith('.csv'));

      if (!tokenFile) {
        logger.info('Token CSV file not found');
        
        if (extractAttempts >= maxExtractAttempts) {
          return null;
        }
        
        // Wait before retry
        const retryDelay = 5000; // 5 seconds
        logger.info(`Waiting ${retryDelay/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      logger.info(`Found token CSV file: ${tokenFile}`);
      return path.join(EXTRACT_DIR, tokenFile);
    } catch (error) {
      logger.error(`Artifact extraction failed (attempt ${extractAttempts}/${maxExtractAttempts}): ${error.message}`);
      
      if (extractAttempts >= maxExtractAttempts) {
        logger.error('Max attempts reached, giving up extraction');
        return null;
      }
      
      // Wait before retry
      const retryDelay = 5000; // 5 seconds
      logger.info(`Waiting ${retryDelay/1000} seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return null;
}

/**
 * Extract cookies from CSV file
 * @param {string} csvFilePath - CSV file path
 * @returns {Promise<string[]>} - Extracted cookie array
 */
async function extractCookiesFromCsvFile(csvFilePath) {
  const maxExtractAttempts = 3;
  let attempt = 1;
  
  while (attempt <= maxExtractAttempts) {
    logger.info(`Attempting to extract cookies from CSV (attempt ${attempt}/${maxExtractAttempts})...`);
    
    try {
      // Read file content
      if (!fs.existsSync(csvFilePath)) {
        logger.error(`CSV file does not exist: ${csvFilePath}`);
        return [];
      }
      
      // Read file content and handle possible newlines
      let fileContent = fs.readFileSync(csvFilePath, 'utf8');
      fileContent = fileContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // First try to extract all possible cookies directly from file content
      const cookies = [];
      
      // 1. Check for JWT format token (new format)
      const jwtRegex = /ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
      const jwtMatches = fileContent.match(jwtRegex);
      
      if (jwtMatches && jwtMatches.length > 0) {
        logger.info(`Extracted ${jwtMatches.length} JWT token format cookies directly from file content`);
        jwtMatches.forEach(match => {
          if (!cookies.includes(match)) {
            cookies.push(match);
          }
        });
      }
      
      // 2. Check for old format cookies
      if (fileContent.includes('user_')) {
        logger.info('File contains old format cookie identifier "user_"');
        
        // Try extraction using old extract function
        try {
          const oldFormatCookies = await extractCookiesFromCsv(csvFilePath);
          if (oldFormatCookies && oldFormatCookies.length > 0) {
            logger.info(`Got ${oldFormatCookies.length} cookies via extract module`);
            oldFormatCookies.forEach(cookie => {
              if (!cookies.includes(cookie)) {
                cookies.push(cookie);
              }
            });
          }
        } catch (e) {
          logger.warn('Failed to get cookies via extract module:', e.message);
        }
      }
      
      // 3. If cookies found, return result
      if (cookies.length > 0) {
        const newFormatCount = cookies.filter(c => c.startsWith('ey')).length;
        const oldFormatCount = cookies.filter(c => c.includes('%3A%3A')).length;
        
        logger.info(`Total found ${cookies.length} cookies`);
        logger.info(`New format cookies (ey prefix): ${newFormatCount}`);
        logger.info(`Old format cookies (contains %3A%3A): ${oldFormatCount}`);
        logger.info(`Other format cookies: ${cookies.length - newFormatCount - oldFormatCount}`);
        
        return cookies;
      }
      
      logger.warn(`Failed to extract any cookies from file (attempt ${attempt}/${maxExtractAttempts})`);
    } catch (error) {
      logger.error(`Error extracting cookies from CSV (attempt ${attempt}/${maxExtractAttempts}):`, error);
    }
    
    attempt++;
    if (attempt <= maxExtractAttempts) {
      logger.info(`Waiting 5 seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  logger.error(`Failed to extract cookies from CSV after ${maxExtractAttempts} attempts`);
  return [];
}

// Add new valid cookies to system
function addNewCookiesToSystem(apiKey, newCookies) {
  try {
    logger.info(`Preparing to add ${newCookies.length} new cookies to system`);
    
    // Get current cookies
    const currentCookies = keyManager.getAllCookiesForApiKey(apiKey) || [];
    logger.info(`API key ${apiKey} has ${currentCookies.length} cookies`);
    
    // Get invalid cookies
    const invalidCookies = keyManager.getInvalidCookies() || [];
    logger.info(`System has ${invalidCookies.length || 0} invalid cookies`);
    
    // Filter out new valid cookies
    let newValidCookies = [];
    
    // Check invalidCookies type and handle accordingly
    if (invalidCookies instanceof Set) {
      newValidCookies = newCookies.filter(cookie => 
        !currentCookies.includes(cookie) && !invalidCookies.has(cookie)
      );
    } else if (Array.isArray(invalidCookies)) {
      newValidCookies = newCookies.filter(cookie => 
        !currentCookies.includes(cookie) && !invalidCookies.includes(cookie)
      );
    } else if (invalidCookies && typeof invalidCookies === 'object') {
      // If plain object, check if cookie exists as key
      newValidCookies = newCookies.filter(cookie => 
        !currentCookies.includes(cookie) && !(cookie in invalidCookies)
      );
    } else {
      // If invalidCookies not expected type, only filter current cookies
      newValidCookies = newCookies.filter(cookie => !currentCookies.includes(cookie));
    }
    
    logger.info(`After filtering: ${newValidCookies.length} new valid cookies`);
    
    // Validate cookie completeness
    const validatedCookies = newValidCookies.filter(cookie => {
      // Check if new format JWT token (ey prefix)
      if (cookie.startsWith('ey') && cookie.includes('.')) {
        const parts = cookie.split('.');
        // Check if JWT has three parts
        if (parts.length !== 3) {
          logger.warn(`Skipping incomplete JWT cookie (new format): ${cookie}`);
          return false;
        }
        return true;
      }
      // Check if old format cookie contains JWT's three parts
      else if (cookie.includes('%3A%3A')) {
        const parts = cookie.split('%3A%3A');
        if (parts.length === 2) {
          const jwt = parts[1];
          // Check if JWT contains dots (indicating three parts)
          if (!jwt.includes('.') || jwt.split('.').length !== 3) {
            logger.warn(`Skipping incomplete cookie (old format): ${cookie}`);
            return false;
          }
        }
      }
      return true;
    });
    
    logger.info(`After validation: ${validatedCookies.length} valid cookies`);
    
    if (validatedCookies.length > 0) {
      // Add new valid cookies to system
      keyManager.addOrUpdateApiKey(apiKey, [...currentCookies, ...validatedCookies]);
      logger.info(`Successfully added ${validatedCookies.length} new cookies to API key ${apiKey}`);
      return validatedCookies.length; // Return count of cookies added
    } else {
      logger.info(`No new valid cookies to add to API key ${apiKey}`);
      return 0; // No cookies added, return 0
    }
  } catch (error) {
    logger.error('Error adding new cookies to system:', error);
    return 0; // Return 0 on error
  }
}

// Clean up temporary files
function cleanupTempFiles() {
  try {
    logger.info('Starting temporary file cleanup...');
    
    // Clean download directory
    if (fs.existsSync(DOWNLOAD_DIR)) {
      fs.readdirSync(DOWNLOAD_DIR).forEach(file => {
        fs.unlinkSync(path.join(DOWNLOAD_DIR, file));
      });
    }
    
    // Clean extract directory
    if (fs.existsSync(EXTRACT_DIR)) {
      fs.readdirSync(EXTRACT_DIR).forEach(file => {
        fs.unlinkSync(path.join(EXTRACT_DIR, file));
      });
    }
    
    logger.info('Temporary file cleanup complete');
  } catch (error) {
    logger.error('Failed to clean temporary files:', error);
  }
}

// Check if API Key needs more Cookies
function checkApiKeyNeedRefresh(apiKey, minCookieCount = config.refresh.minCookieCount) {
  const cookies = keyManager.getAllCookiesForApiKey(apiKey);
  return cookies.length < minCookieCount;
}

// Mark all existing cookies as invalid and remove from API Key
function markExistingCookiesAsInvalid(apiKey) {
  try {
    // Get all cookies for current API Key
    const currentCookies = keyManager.getAllCookiesForApiKey(apiKey) || [];
    logger.info(`Marking ${currentCookies.length} existing cookies of API Key ${apiKey} as invalid...`);
    
    // If no cookies, return directly
    if (currentCookies.length === 0) {
      logger.info(`API Key ${apiKey} has no existing cookies, nothing to mark invalid`);
      return 0;
    }
    
    // Get invalid cookies list
    const invalidCookies = keyManager.getInvalidCookies();
    let markedCount = 0;
    
    // Iterate cookies and add to invalid list
    for (const cookie of currentCookies) {
      // Add cookie to invalid set
      if (invalidCookies instanceof Set) {
        invalidCookies.add(cookie);
      }
      markedCount++;
    }
    
    // Save invalid cookies to file
    keyManager.saveInvalidCookiesToFile();
    
    // Clear current API Key cookie list
    keyManager.addOrUpdateApiKey(apiKey, []);
    
    // Save updated API Keys
    keyManager.saveApiKeysToFile();
    
    logger.info(`Marked ${markedCount} cookies of API Key ${apiKey} as invalid and removed from API Key`);
    return markedCount;
  } catch (error) {
    logger.error(`Error marking existing cookies as invalid:`, error);
    return 0;
  }
}

// Main function: auto refresh Cookie
async function autoRefreshCookies(apiKey, minCookieCount = config.refresh.minCookieCount) {
  logger.info(`Starting auto Cookie refresh, target API Key: ${apiKey}, min Cookie count: ${minCookieCount}`);
  
  try {
    // Check if refresh needed
    if (!checkApiKeyNeedRefresh(apiKey, minCookieCount)) {
      logger.info(`API Key ${apiKey} has enough Cookies, no refresh needed`);
      return {
        success: true,
        message: 'Current Cookie count sufficient, no refresh needed',
        refreshed: 0
      };
    }
    
    // Get latest Artifact
    const artifact = await getLatestArtifact();
    if (!artifact) {
      return {
        success: false,
        message: 'Failed to get Artifact',
        refreshed: 0
      };
    }
    
    // Download Artifact
    const zipFilePath = await downloadArtifact(artifact);
    if (!zipFilePath) {
      return {
        success: false,
        message: 'Failed to download Artifact',
        refreshed: 0
      };
    }
    
    // Extract Artifact
    const csvFilePath = await extractArtifact(zipFilePath);
    if (!csvFilePath) {
      return {
        success: false,
        message: 'Failed to extract Artifact',
        refreshed: 0
      };
    }
    
    // Extract Cookie
    const cookies = await extractCookiesFromCsvFile(csvFilePath);
    if (cookies.length === 0) {
      return {
        success: false,
        message: 'No valid Cookies found',
        refreshed: 0
      };
    }
    
    // Analyze extracted cookie formats
    const newFormatCookies = cookies.filter(cookie => cookie.startsWith('ey'));
    const oldFormatCookies = cookies.filter(cookie => cookie.includes('%3A%3A'));
    logger.info(`Extracted ${newFormatCookies.length} new format cookies (ey prefix)`);
    logger.info(`Extracted ${oldFormatCookies.length} old format cookies (contains %3A%3A)`);
    
    // Based on config, decide whether to mark existing cookies as invalid
    const refreshMode = process.env.COOKIE_REFRESH_MODE || 'append';
    
    if (refreshMode === 'replace') {
      // Mark existing cookies as invalid and remove from API Key
      logger.info('Using replace mode: marking existing cookies as invalid');
      markExistingCookiesAsInvalid(apiKey);
    } else {
      logger.info('Using append mode: keep existing cookies, only add new ones');
    }
    
    // Add new Cookies to system
    const addedCount = addNewCookiesToSystem(apiKey, cookies);
    
    // Clean up temporary files
    cleanupTempFiles();
    
    return {
      success: true,
      message: `Successfully added ${addedCount} new Cookies (new format: ${newFormatCookies.length}, old format: ${oldFormatCookies.length})`,
      refreshed: addedCount
    };
  } catch (error) {
    logger.error('Auto Cookie refresh failed:', error);
    return {
      success: false,
      message: `Refresh failed: ${error.message}`,
      refreshed: 0
    };
  }
}

module.exports = {
  autoRefreshCookies,
  checkApiKeyNeedRefresh,
  getLatestArtifact,
  downloadArtifact,
  extractArtifact,
  extractCookiesFromCsvFile,
  addNewCookiesToSystem,
  cleanupTempFiles,
  triggerWorkflow,
  markExistingCookiesAsInvalid
}; 